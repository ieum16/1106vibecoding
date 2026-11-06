const SCOPES = 'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.ReadWrite offline_access';
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

async function exchange(settings, values) {
  const response = await fetch(`https://login.microsoftonline.com/${settings.tenant}/oauth2/v2.0/token`, {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:settings.clientId, scope:SCOPES, ...values}), signal:AbortSignal.timeout(25000)
  });
  const result = await response.json();
  if (!response.ok) throw Error(`Microsoft 로그인 실패 (${result.error || response.status}). 앱 등록과 권한을 확인하고 다시 연결하세요.`);
  const {auth:old} = await chrome.storage.session.get('auth');
  const auth = {accessToken:result.access_token, refreshToken:result.refresh_token || (values.grant_type === 'refresh_token' ? old?.refreshToken : undefined),
    expiresAt:Date.now() + result.expires_in * 1000, clientId:settings.clientId, tenant:settings.tenant};
  await chrome.storage.session.set({auth});
  return auth.accessToken;
}

export async function signIn(settings) {
  if (!settings.clientId) throw Error('먼저 연결 설정에 Microsoft 애플리케이션 ID를 저장하세요.');
  const verifier = random(), state = random();
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  const redirect = chrome.identity.getRedirectURL();
  const query = new URLSearchParams({client_id:settings.clientId, response_type:'code', redirect_uri:redirect,
    response_mode:'query', scope:SCOPES, state, code_challenge:challenge, code_challenge_method:'S256', prompt:'select_account'});
  const finalUrl = await chrome.identity.launchWebAuthFlow({url:`https://login.microsoftonline.com/${settings.tenant}/oauth2/v2.0/authorize?${query}`, interactive:true});
  const result = new URL(finalUrl);
  if (result.origin !== new URL(redirect).origin || result.pathname !== new URL(redirect).pathname || result.searchParams.get('state') !== state) throw Error('로그인 응답 검증에 실패했습니다.');
  if (!result.searchParams.get('code')) throw Error('로그인이 취소되었거나 권한이 거절되었습니다.');
  return exchange(settings,{grant_type:'authorization_code',code:result.searchParams.get('code'),redirect_uri:redirect,code_verifier:verifier});
}

export async function getToken(settings) {
  const {auth} = await chrome.storage.session.get('auth');
  if (!auth || auth.clientId !== settings.clientId || auth.tenant !== settings.tenant) throw Error('Microsoft 계정을 연결하세요. 브라우저를 다시 열었다면 재연결이 필요합니다.');
  if (auth.expiresAt > Date.now() + 60000) return auth.accessToken;
  if (!auth.refreshToken) throw Error('로그인이 만료되었습니다. 다시 연결하세요.');
  return exchange(settings,{grant_type:'refresh_token',refresh_token:auth.refreshToken});
}

import {getToken} from './auth.js';

export async function graph(settings, path, options = {}) {
  const url = new URL(path.startsWith('https:') ? path : `https://graph.microsoft.com/v1.0${path}`);
  if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/')) throw Error('잘못된 Graph 주소입니다.');
  const token = await getToken(settings);
  const response = await fetch(url, {...options, headers:{Authorization:`Bearer ${token}`,
    'Content-Type':'application/json', Prefer:'IdType="ImmutableId", outlook.body-content-type="text"'}, signal:AbortSignal.timeout(25000)});
  if (!response.ok) {
    const error = Error(response.status === 429 ? `요청이 많습니다. ${response.headers.get('Retry-After') || '60'}초 뒤 이어하기를 누르세요.` :
      response.status === 401 ? '로그인이 만료되었습니다. 다시 연결하세요.' :
      response.status === 403 ? '메일 접근 권한이 없습니다. 회사 관리자 승인 또는 Mail.ReadWrite 권한을 확인하세요.' :
      `메일 요청에 실패했습니다 (HTTP ${response.status}). 연결 상태와 메일·폴더 존재 여부를 확인하세요.`);
    error.httpStatus = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

export async function listFolders(settings) {
  const inbox = await graph(settings,'/me/mailFolders/inbox?$select=id');
  const junk = await graph(settings,'/me/mailFolders/junkemail?$select=id');
  const folders = [];
  async function walk(path, prefix = '') {
    let next = `${path}?$top=100&$select=id,displayName,childFolderCount`;
    do {
      const page = await graph(settings,next);
      for (const f of page.value) {
        const name = prefix + f.displayName;
        folders.push({id:f.id,name,isInbox:f.id === inbox.id,isJunk:f.id === junk.id});
        if (f.childFolderCount) await walk(`/me/mailFolders/${encodeURIComponent(f.id)}/childFolders`,`${name} / `);
      }
      next = page['@odata.nextLink'];
    } while (next);
  }
  await walk('/me/mailFolders');
  return folders;
}

export async function listMessages(settings) {
  const since = new Date(Date.now() - settings.days * 86400000).toISOString();
  const query = new URLSearchParams({'$select':'id,subject,from,body,parentFolderId,receivedDateTime', '$filter':`receivedDateTime ge ${since}`, '$orderby':'receivedDateTime desc', '$top':String(Math.min(settings.limit,25))});
  const messages = [];
  let next = `/me/mailFolders/inbox/messages?${query}`;
  while (next && messages.length < settings.limit) {
    const page = await graph(settings,next);
    messages.push(...page.value.slice(0,settings.limit - messages.length));
    next = page['@odata.nextLink'];
  }
  return messages;
}

export const currentMessage = (settings,id) => graph(settings,`/me/messages/${encodeURIComponent(id)}?$select=id,parentFolderId`);
export const moveMessage = (settings,id,destination) => graph(settings,`/me/messages/${encodeURIComponent(id)}/move`,{method:'POST',body:JSON.stringify({destinationId:destination})});

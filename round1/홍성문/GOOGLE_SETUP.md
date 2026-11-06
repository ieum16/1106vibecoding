# Google 일정 연동 준비

시간 설정, 날짜별 일정, 오전·오후 일괄 완료, 테마 5개는 별도 준비 없이 사용할 수 있습니다.

## 연결 준비

1. Chrome 확장 프로그램 관리 화면에서 이 폴더를 압축해제된 확장 프로그램으로 불러오고 확장 프로그램 ID를 확인합니다.
2. Google Cloud Console에서 프로젝트를 만들고 Google Calendar API를 사용 설정합니다.
3. Google Auth Platform의 동의 화면과 대상 사용자를 설정합니다. 테스트 모드라면 로그인할 Google 계정을 테스트 사용자로 추가합니다.
4. OAuth 클라이언트를 Chrome 확장 프로그램 유형으로 만들고 확장 프로그램 ID를 등록합니다.
5. 발급된 클라이언트 ID를 아래처럼 manifest.json 최상위 속성으로 추가합니다. 예시 ID는 실제 값으로 바꿉니다. 클라이언트 비밀번호는 넣지 않습니다.

```json
"oauth2": {
  "client_id": "발급받은-ID.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/calendar.events.readonly"]
},
```

6. 확장 프로그램을 새로고침하고 설정 → Google 연결 및 가져오기를 누릅니다. 로그인 중 작은 창이 닫혀 연결이 중단되는 것을 막기 위해 별도 탭이 열립니다. 그 탭에서 같은 버튼을 다시 누르고, Chrome에 로그인한 Google 계정의 읽기 권한을 허용합니다.
7. 연결 성공 시 자동 갱신이 켜집니다. 이후 창을 열 때 오늘 일정을 갱신합니다. 창을 닫은 상태에서 주기적 동기화나 알림은 제공하지 않습니다.

## 동작과 범위

- 기기 현지 시간으로 오늘과 겹치는 기본 Google 캘린더 일정만 가져옵니다. 다른 날짜를 보고 있어도 가져오기는 오늘을 대상으로 합니다.
- Gmail의 항공편·호텔 예약 등이 Google 캘린더에 등록되어 있다면 포함됩니다. Gmail 메일함에서 일반 메일을 읽거나 날짜를 추측하지는 않습니다.
- 중복 추가를 막고 완료 상태를 보존합니다. 가져온 일정을 삭제하면 같은 날짜에 다시 표시하지 않습니다.
- Google에서 삭제된 일정은 다음 갱신 시 오늘 목록에서 제거합니다. 제목과 시간도 원본으로 갱신합니다.
- 종일 일정과 전날부터 이어지는 일정은 오늘의 '시간 미정 · 종일'에 표시합니다.
- 완료·삭제·시간 변경은 로컬 목록에만 적용합니다. Google 원본은 바꾸지 않습니다. 가져온 일정의 시간은 다음 갱신 시 원본으로 돌아갑니다.
- 기존 할 일은 처음 업데이트를 열었을 때의 날짜, 시간 미정으로 보존합니다.
- 기본적으로 현재 Chrome 계정 연결을 사용합니다.

## 현재 한계

실제 클라이언트 ID와 로그인 승인이 없으면 Google 연결은 실행할 수 없습니다. 이 폴더에는 계정 정보나 OAuth 자격 증명이 없습니다. 일반 Gmail 메일 전체를 분석해 일정을 추출하려면 Gmail API 읽기 권한, 날짜·시간 추출 및 사용자 확인 화면이 추가로 필요합니다. 공개 배포 시 Google OAuth 검증이 요구될 수 있습니다.

공식 문서:
- https://developer.chrome.com/docs/extensions/reference/api/identity
- https://developer.chrome.com/docs/extensions/how-to/integrate/oauth
- https://developers.google.com/workspace/calendar/api/v3/reference/events/list

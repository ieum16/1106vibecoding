#!/bin/zsh
cd "${0:A:h}"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo '.env 파일을 만들었습니다. API 키와 모델을 입력한 뒤 다시 실행하세요.'
  echo 'README.md의 처음 실행하기를 참고하세요.'
  read 'reply?Enter 키를 누르면 닫힙니다.'
  exit 0
fi
npm start
read 'reply?Enter 키를 누르면 닫힙니다.'

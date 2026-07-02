YK PULSE 유지보수 쉬운 구조

이 버전은 https://yk-pulse.vercel.app 에서 Apps Script 웹앱을 그대로 띄우는 껍데기입니다.

현재 연결된 Apps Script URL:
https://script.google.com/macros/s/AKfycbwlS6vyYE2dUMzFrjTxDe8neP3fO4bVnN_IOnFn7Lfpd-qq_l86tvqh3fYifBG0F1iIBQ/exec

앞으로 수정 순서:
1. 스프레드시트 > 확장 프로그램 > Apps Script
2. Code.gs / Index.html 수정
3. 저장
4. 배포 > 배포 관리
5. 기존 웹앱 수정 > 버전: 새 버전
6. 배포

그 이후 https://yk-pulse.vercel.app 를 새로고침하면 최신 Apps Script 화면이 보입니다.

Vercel은 이 ZIP으로 한 번만 재배포하면 됩니다.

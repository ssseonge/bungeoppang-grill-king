# 붕어빵 굽기왕

로그인 없이 이름과 점수를 저장하는 모바일용 붕어빵 굽기 미니게임입니다.
로컬에서는 브라우저 저장소를 쓰고, Vercel 배포 환경에서는 Supabase 랭킹 API를 함께 사용합니다.

## 플레이

- 철판 칸을 터치해서 `반죽 > 뒤집기 > 꺼내기`를 진행합니다.
- 아래 `펌핑! 화력증가!` 버튼을 눌러 화력을 올립니다.
- 재고가 있으면 손님이 자동으로 사갑니다.
- 손님을 놓치면 평판이 떨어지고, 평판이 0이 되면 게임오버입니다.

## 배포

기본 게임은 정적 파일만으로 실행됩니다. 온라인 랭킹은 Vercel Serverless Function과 Supabase가 필요합니다.

```text
index.html
styles.css
game.js
BMJUA.woff2
api/scores.js
supabase/schema.sql
```

## Supabase

1. Supabase SQL Editor에서 `supabase/schema.sql`을 실행합니다.
2. Vercel 환경 변수에 아래 값을 추가합니다.

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SCORE_HASH_SECRET
```

브라우저에는 Supabase 서비스 키를 노출하지 않습니다. 게임 클라이언트는 `/api/scores`만 호출합니다.

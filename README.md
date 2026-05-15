# fintech-app-frontend

대학생 전용 자산 관리 및 근로 생애주기 맞춤형 소득 최적화 플랫폼의 React Native 프론트엔드 애플리케이션입니다.

본 앱은 MSA 기반 백엔드 서비스와 REST API로 통신하며, 서버 응답은 공통 Envelope 패턴을 기준으로 처리합니다.

## 프로젝트 개요

이 프로젝트는 소득과 지출이 불규칙한 대학생 사용자를 대상으로 다음 기능을 제공합니다.

- 소셜 로그인 및 JWT 기반 사용자 인증
- 계좌 목록 및 잔액 조회
- 거래 내역 조회
- 송금 및 이체 요청
- 일일 가용 생활비 조회
- 소득/지출 분석
- 대학생 라이프사이클 기반 활동 추천
- 보안 인증 및 추가 인증 흐름 처리

## 기술 스택

| 구분             | 기술                      |
| ---------------- | ------------------------- |
| Language         | JavaScript                |
| Framework        | React Native              |
| Runtime          | Expo                      |
| State Management | Redux Toolkit             |
| API Client       | Axios                     |
| Navigation       | React Navigation          |
| Storage          | AsyncStorage, SecureStore |
| Build            | EAS Build                 |
| Test             | Manual Test               |

## Repository

fintech-app-frontend

본 Repository는 GitHub Organization 내부에서 관리합니다.

## 브랜치 전략

본 프로젝트는 Git-Flow 기반 브랜치 전략을 사용합니다.

| Branch         | 설명                               |
| -------------- | ---------------------------------- |
| main           | 실제 배포용 브랜치. 직접 수정 금지 |
| develop        | 개발 통합 브랜치                   |
| feature/기능명 | 기능 단위 작업 브랜치              |

예시:

```
feature/init-project
feature/login
feature/account-list
feature/daily-limit
feature/transfer
```

## 설치 방법

### 1. Repository clone

```bash
git clone [프론트엔드 Repository URL]
cd fintech-app-frontend
```

### 2. 패키지 설치

```bash
npm install
```

### 3. Expo 실행

```bash
npx expo start
```

### 4. Android 실행

```bash
npx expo start --android
```

### 5. iOS 실행

```bash
npx expo start --ios
```

### 6. Web 실행

```bash
npx expo start --web
```

## 초기 프로젝트 생성 명령어

프로젝트를 처음 생성하는 경우 아래 명령어를 사용할 수 있습니다.

```bash
npx create-expo-app fintech-app-frontend
cd fintech-app-frontend
```

필요 패키지 설치:

```bash
npm install axios
npm install @reduxjs/toolkit react-redux
npm install @react-navigation/native
npm install @react-navigation/native-stack
npm install @react-navigation/bottom-tabs
npm install react-native-screens react-native-safe-area-context
npm install @react-native-async-storage/async-storage
npm install expo-secure-store
npm install react-native-dotenv
npm install zod
npm install uuid
```

EAS Build 사용 시:

```bash
npm install -g eas-cli
eas login
eas build:configure
```

## 폴더 구조

```
fintech-app-frontend/
├── src/
│   ├── app/
│   │   └── AppNavigator.js
│   │
│   ├── assets/
│   │
│   ├── components/
│   │   ├── common/
│   │   └── ui/
│   │
│   ├── constants/
│   │   ├── apiCodes.js
│   │   ├── requiredActions.js
│   │   └── routes.js
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── authApi.js
│   │   │   ├── authSlice.js
│   │   │   └── authStorage.js
│   │   │
│   │   ├── asset/
│   │   │   ├── assetApi.js
│   │   │   └── assetSlice.js
│   │   │
│   │   └── work/
│   │       ├── workApi.js
│   │       └── workSlice.js
│   │
│   ├── hooks/
│   │
│   ├── navigation/
│   │   ├── RootNavigator.js
│   │   ├── AuthNavigator.js
│   │   └── MainNavigator.js
│   │
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.js
│   │   │   └── SignupScreen.js
│   │   │
│   │   ├── home/
│   │   │   └── HomeScreen.js
│   │   │
│   │   ├── asset/
│   │   │   ├── AccountListScreen.js
│   │   │   ├── DailyLimitScreen.js
│   │   │   └── TransferScreen.js
│   │   │
│   │   └── work/
│   │       └── RecommendationScreen.js
│   │
│   ├── services/
│   │   ├── apiClient.js
│   │   ├── apiErrorHandler.js
│   │   └── tokenService.js
│   │
│   ├── store/
│   │   └── store.js
│   │
│   └── utils/
│       ├── formatDate.js
│       ├── formatMoney.js
│       └── idempotencyKey.js
│
├── .env.example
├── .gitignore
├── App.js
├── app.json
├── eas.json
├── package.json
└── README.md
```

## 환경 변수 설정

`.env.example` 파일을 참고하여 `.env` 파일을 생성합니다.

```bash
cp .env.example .env
```

### .env.example

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080
EXPO_PUBLIC_API_TIMEOUT=10000
EXPO_PUBLIC_APP_NAME=fintech-app-frontend
EXPO_PUBLIC_APP_VERSION=1.0.0
```

주의사항:

- 실제 서버 URL은 .env에만 작성합니다.
- .env 파일은 Git에 올리지 않습니다.
- API Key, Access Token, Refresh Token 등 민감 정보는 코드에 직접 작성하지 않습니다.

## 실행 방법

```bash
npm install
npx expo start
```

Expo Go 앱 또는 Android/iOS Emulator를 통해 실행할 수 있습니다.

## EAS Build

### Android staging build

```bash
eas build --platform android --profile staging
```

### iOS Preview Build

```bash
eas build --platform ios --profile staging
```

### Production Build

```bash
eas build --platform all --profile production
```

## API 통신 규칙

본 프로젝트의 Client-Server 통신은 REST API를 사용합니다.

서버 응답은 성공/실패 여부와 관계없이 공통 Envelope 구조를 사용합니다.

### 공통 성공 응답 Envelope

```json
{
  "success": true,
  "status": 200,
  "code": "AUTH-200-001",
  "message": "로그인 성공",
  "data": {},
  "error": null,
  "traceId": "req-xxxx",
  "timestamp": "2026-04-09T20:30:10Z"
}
```

### 공통 실패 응답 Envelope

```json
{
  "success": false,
  "status": 400,
  "code": "AUTH-400-002",
  "message": "입력값을 다시 확인해 주세요.",
  "data": null,
  "error": {
    "reason": "회원가입 요청 검증에 실패했습니다.",
    "details": [
      {
        "field": "email",
        "reason": "이메일 형식이 올바르지 않습니다."
      }
    ],
    "requiredAction": "NONE"
  },
  "traceId": "req-5555-qwer",
  "timestamp": "2026-04-09T20:30:10Z"
}
```

### Envelope 필드 설명

| 필드      | 타입        | 설명                    |
| --------- | ----------- | ----------------------- |
| success   | boolean     | 요청 성공 여부          |
| status    | number      | 실제 HTTP Status Code   |
| code      | string      | 프론트 분기용 공통 코드 |
| message   | string      | 사용자 표시용 메시지    |
| data      | object/null | 성공 시 응답 데이터     |
| error     | object/null | 실패 시 에러 상세       |
| traceId   | string      | 요청 추적 ID            |
| timestamp | string      | 응답 생성 시간          |

## 프론트엔드 응답 처리 기준

프론트엔드는 message 문구로 로직을 분기하지 않습니다.

분기 기준은 아래 순서를 따릅니다.

1. status
2. code
3. error.requiredAction

message는 Toast, Alert, Dialog 등 사용자 안내 문구로만 사용합니다.

### code 규칙

서버 응답의 code는 아래 형식을 따릅니다.

```
[DOMAIN]-[HTTPSTATUS]-[SERIAL]
```

예시:

```
AUTH-401-002
ASSET-409-001
SEC-403-001
WORK-200-001
AI-500-001
```

| 영역       | 의미                  |
| ---------- | --------------------- |
| DOMAIN     | 기능 도메인           |
| HTTPSTATUS | 실제 HTTP Status Code |
| SERIAL     | 세부 상황 번호        |

### 주요 도메인 코드

| DOMAIN | 설명                |
| ------ | ------------------- |
| AUTH   | 인증/인가           |
| ASSET  | 자산/계좌/송금      |
| WORK   | 소득/지출/활동 추천 |
| AI     | AI 분석 기능        |
| SEC    | 보안 정책/탐지      |

### requiredAction Enum

requiredAction은 프론트 화면 이동 및 행동 제어를 위한 값입니다.

| 값              | 프론트 처리                             |
| --------------- | --------------------------------------- |
| NONE            | 메시지만 표시                           |
| RE_LOGIN        | 토큰 삭제 후 로그인 화면 이동           |
| REFRESH_TOKEN   | Access Token 재발급 후 원래 요청 재시도 |
| MFA_AUTH        | 추가 인증 화면으로 이동                 |
| RETRY           | 즉시 재시도 가능                        |
| RETRY_LATER     | 나중에 다시 시도 안내                   |
| CONTACT_SUPPORT | 고객센터/문의 화면 안내                 |

## 인증 처리 규칙

### Access Token

API 요청 시 `Authorization: Bearer {accessToken}` 형태로 전달합니다.
가능한 경우 메모리 또는 SecureStore 기준으로 관리합니다.

### Refresh Token

SecureStore에 저장합니다.
Access Token 만료 시 재발급 요청에 사용합니다.

### Logout

로그아웃 시 아래 데이터를 모두 삭제합니다.

- accessToken
- refreshToken
- 사용자 인증 상태
- 필요한 경우 AsyncStorage에 저장된 사용자 임시 정보

## Storage 사용 기준

| Storage      | 사용 목적                                   |
| ------------ | ------------------------------------------- |
| SecureStore  | Refresh Token 등 민감 정보 저장             |
| AsyncStorage | 앱 설정, 온보딩 여부, 일반 캐시 데이터 저장 |

주의:

- Refresh Token은 AsyncStorage에 저장하지 않습니다.
- 민감 정보는 코드, 로그, Git에 남기지 않습니다.

## Axios API Client 처리 흐름

`src/services/apiClient.js`에서 공통 Axios 인스턴스를 관리합니다.

### 요청 Interceptor

- Access Token 자동 첨부
- 필요한 요청에 Idempotency-Key 첨부
- 공통 baseURL 적용

### 응답 Interceptor

- Envelope 구조 확인
- `success === true`이면 data 반환
- `success === false`이면 공통 에러 핸들러로 전달
- `AUTH-401-002` 또는 `REFRESH_TOKEN`이면 Access Token 재발급 후 원래 요청 재시도
- `RE_LOGIN`이면 토큰 삭제 후 로그인 화면 이동 처리

### Idempotency-Key 처리

송금/이체처럼 중복 요청이 발생하면 안 되는 API에는 Idempotency-Key를 Header에 포함합니다.

예시:

```
Idempotency-Key: generated-uuid-value
```

사용 대상 예시:

- 송금 요청
- 이체 요청
- 결제 요청
- 정산 요청

## 주요 화면

| 화면                 | 설명               |
| -------------------- | ------------------ |
| LoginScreen          | 로그인 화면        |
| SignupScreen         | 회원가입 화면      |
| HomeScreen           | 메인 홈 화면       |
| AccountListScreen    | 계좌 목록 화면     |
| DailyLimitScreen     | 일일 가용금액 화면 |
| TransferScreen       | 송금 화면          |
| RecommendationScreen | 활동 추천 화면     |

## PR 규칙

PR 작성 시 아래 내용을 포함합니다.

```
## 작업 내용

- React Native 프로젝트 초기 세팅
- 폴더 구조 생성
- Axios API Client 기본 구조 추가
- Redux Store 설정
- Navigation 기본 구조 추가

## 확인 사항

- [ ] 앱이 정상 실행되는가?
- [ ] 불필요한 파일이 Git에 포함되지 않았는가?
- [ ] .env 파일이 제외되었는가?
- [ ] main 브랜치가 아닌 develop 브랜치로 PR을 생성했는가?
- [ ] 공통 API Envelope 규칙을 따르는가?


## 코드 작성 규칙

- API 요청은 각 feature의 xxxApi.js에서 작성합니다.
- 전역 상태는 Redux Toolkit Slice로 관리합니다.
- 화면 이동 경로는 routes.js에서 상수로 관리합니다.
- API code 값은 apiCodes.js에서 상수로 관리합니다.
- requiredAction 값은 requiredActions.js에서 상수로 관리합니다.
- 사용자 표시 메시지는 서버의 message를 우선 사용합니다.
- 프론트 분기는 status, code, error.requiredAction 기준으로 처리합니다.


## 주의사항

- main 브랜치에 직접 push하지 않습니다.
- 모든 작업은 feature/기능명 브랜치에서 진행합니다.
- PR은 develop 브랜치로 생성합니다.
- .env 파일은 Git에 올리지 않습니다.
- 실제 API Key, 서버 URL, 토큰 값은 코드에 직접 작성하지 않습니다.
- 서버 응답의 message는 사용자 표시용이고, 로직 분기는 status, code, requiredAction 기준으로 처리합니다.
- 민감 정보는 SecureStore에 저장합니다.
```

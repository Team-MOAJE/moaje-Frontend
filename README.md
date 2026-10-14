# MOAJE (모아제)

대학생을 위한 금융 관리 모바일 앱의 프론트엔드입니다. React Native(Expo)로 작성되었으며, 계좌·거래내역 조회, 송금, 소비 분석, 재무 온보딩, 미래 자금 시뮬레이션 등의 화면을 Gateway 경유 REST API와 연결합니다.

> **학습·시연 목적의 대학생 졸업 프로젝트입니다.** 상용 금융 서비스가 아닙니다.
>
> - 앱에서 개설하는 계좌는 서버에 생성되는 **시연용 Mock 계좌**이며 실제 금융기관 계좌가 아닙니다.
> - 송금은 백엔드 시연 환경 안에서 처리되며 실제 금융기관으로 이체되지 않습니다.
> - 회원가입은 휴대폰 번호와 PIN만 사용하며 **휴대폰 소유자 본인인증(SMS 등)을 하지 않습니다.**

---

## 목차

1. [주요 기능](#1-주요-기능)
2. [기술 스택](#2-기술-스택)
3. [아키텍처](#3-아키텍처)
4. [디렉터리 구조](#4-디렉터리-구조)
5. [시작하기](#5-시작하기)
6. [주요 사용자 흐름](#6-주요-사용자-흐름)
7. [API 통신 및 인증 구조](#7-api-통신-및-인증-구조)
8. [상태 관리](#8-상태-관리)
9. [테스트](#9-테스트)
10. [빌드](#10-빌드)
11. [개발 및 시연 참고 사항](#11-개발-및-시연-참고-사항)

---

## 1. 주요 기능

아래 표의 **구현 상태**는 소스코드에서 확인되는 범위(화면이 실제 API 호출 코드와 연결되어 있는지)를 뜻합니다. "API 연결 코드 있음"은 **실제 백엔드와의 통합 테스트가 완료되었다는 의미가 아닙니다.** 이 저장소의 자동 테스트는 모의(mock) 환경 기반이며, 실제 Gateway 대상 검증은 `test:api:smoke`(비파괴 도달 확인) 수준입니다. ([9. 테스트](#9-테스트) 참고)

### 인증 및 회원 관리

| 기능                                                   | 구현 상태                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 휴대폰 번호 + 6자리 PIN 로그인                         | API 연결 코드 있음 (`/api/v1/auth/login` 후 `/me` 확인)                                                     |
| 회원가입 (약관 동의 → 휴대폰 → 이름 → PIN 설정/확인)   | API 연결 코드 있음 (`/api/v1/auth/register`)                                                                |
| 이용약관·개인정보 처리 동의 (필수 2종, 버전 포함 전송) | API 연결 코드 있음 (가입 요청에 포함)                                                                       |
| 세션 복원 / 토큰 갱신 / 로그아웃                       | API 연결 코드 있음                                                                                          |
| 앱 잠금 해제 (앱 시작 시 PIN 입력)                     | API 연결 코드 있음 (`/api/v1/auth/session/unlock`)                                                          |
| 회원정보 조회·수정 (이름, 이메일)                      | API 연결 코드 있음 (`GET/PATCH /api/v1/auth/me`)                                                            |
| PIN 변경                                               | API 연결 코드 있음 (`/api/v1/auth/pin/change`)                                                              |
| 회원 탈퇴                                              | API 연결 코드 있음 (`DELETE /api/v1/auth/me`)                                                               |
| **PIN 재설정 (현재 PIN을 모를 때)**                    | **화면만 존재.** 서버 엔드포인트가 연결되어 있지 않아 "준비 중" 안내만 표시되며 서버에서 PIN을 바꿀 수 없음 |
| 휴대폰 가입 여부 사전 확인                             | 미연결 (엔드포인트 미정의). 가입 여부는 로그인 응답으로만 알 수 있음                                        |
| 소셜 로그인, SMS 인증                                  | **없음**                                                                                                    |

### 자산 관리

| 기능                               | 구현 상태                                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 계좌 목록                          | 홈 등에서 API 호출 코드 사용 (`GET /api/v1/assets/accounts`). 전용 `AccountListScreen`은 "준비 중" 플레이스홀더 |
| 계좌 상세 / 잔액 새로고침          | API 연결 코드 있음                                                                                              |
| 거래내역 조회 (커서 기반 더보기)   | API 연결 코드 있음. 기간 필터는 클라이언트에서 적용                                                             |
| 거래내역 상세                      | API 연결 코드 있음                                                                                              |
| Mock 계좌 개설                     | API 연결 코드 있음 (서버의 시연용 Mock 계좌)                                                                    |
| 송금                               | API 연결 코드 있음 (`Idempotency-Key`, 처리 중/불확실 상태 재확인 로직 포함)                                    |
| 하루 사용 가능 금액                | API 연결 코드 있음 (`POST` 계산 요청). 서버에 조회 API가 없어 결과는 기기에 날짜별로 캐시                       |
| 월별 수입·지출, 소비 카테고리 분석 | API 연결 코드 있음                                                                                              |

### 재무 온보딩

| 기능                                              | 구현 상태                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 온보딩 질문 / 답변 제출 / 진행 상태 / 미래 프로필 | API 연결 코드 있음 (Work 서비스)                                                                                                       |
| 완료 여부에 따른 화면 분기                        | 로그인 후 진행 상태를 조회해 온보딩 화면 또는 홈으로 이동                                                                              |
| 기존 로컬 온보딩                                  | 기기 저장소(AsyncStorage) 기반 이전 구현이 남아 있으나, 서버 온보딩 플래그(`WORK_ONBOARDING_ENABLED`)가 `true`라 현재 기본 경로가 아님 |

### 분석 및 미래 설계

| 기능                                                           | 구현 상태                                              |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| Money Recap (월별 요약 스토리)                                 | API 연결 코드 있음                                     |
| 사회인 준비도                                                  | API 연결 코드 있음                                     |
| 미래 자금 시뮬레이션 / 조건부 시뮬레이션                       | API 연결 코드 있음                                     |
| 학사 일정 (대학 목록, 자동 동기화, 일정 조회) · 학기 소비 분석 | API 연결 코드 있음                                     |
| 이상거래(FDS) 알림 · 소비 안전도                               | API 연결 코드 있음                                     |
| 소득 최적화 추천                                               | "준비 중" 플레이스홀더                                 |
| 추가 인증(MFA)                                                 | "준비 중" 플레이스홀더                                 |
| 설정 화면                                                      | 알림 토글은 로컬 상태일 뿐이며 나머지 항목은 "준비 중" |

---

## 2. 기술 스택

버전은 `package.json` 기준입니다.

| 구분            | 기술                                                                                                    | 버전                                       |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 프레임워크      | Expo                                                                                                    | ^57.0.22                                   |
| 런타임          | React / React Native                                                                                    | 19.2.3 / 0.86.3                            |
| 언어            | JavaScript (TypeScript는 devDependency, 타입 설정만 존재)                                               | TypeScript ~6.0.3                          |
| 상태 관리       | Redux Toolkit / React Redux                                                                             | ^2.11.2 / ^9.2.0                           |
| 내비게이션      | React Navigation (native, native-stack)                                                                 | ^7.1.8 / ^7.3.16                           |
| HTTP            | Axios                                                                                                   | ^1.16.0                                    |
| 보안 저장소     | expo-secure-store                                                                                       | ~57.0.4                                    |
| 로컬 저장소     | @react-native-async-storage/async-storage                                                               | 2.2.0                                      |
| UI / 애니메이션 | @expo/ui, react-native-reanimated, react-native-gesture-handler, react-native-svg, expo-linear-gradient | ~57.0.18, 4.5.1, ~2.32.0, 15.15.4, ~57.0.2 |
| 기타            | zod ^4.4.2, uuid ^14.0.0 (멱등성 키), react-native-get-random-values                                    | -                                          |
| 포맷터          | Prettier                                                                                                | ^3.8.3                                     |
| 테스트          | Node 내장 테스트 러너(`node:test`)                                                                      | -                                          |

> `@react-navigation/bottom-tabs`가 설치되어 있으나 사용하지 않으며, 하단 바는 커스텀 컴포넌트(`BottomNavBar`)입니다. ESLint 설정과 lint 스크립트는 없습니다.

---

## 3. 아키텍처

```text
[React Native 앱]
 screens ─▶ features (thunk / API 함수 / 응답 매핑) ─▶ services/apiClient (Axios)
                                                           │
                                                           ▼
                                        API Gateway  (/api/v1/...)
                                 ┌────────┬───────────┬────────┐
                                 Auth   Banking      Asset    Work
```

- 모든 요청은 Gateway 한 곳으로 보내며 개별 서비스 포트로 직접 호출하지 않습니다.
- 화면은 `features/<도메인>`의 thunk·API 함수를 통해서만 서버와 통신합니다. 토큰 처리·응답 해석은 `src/services/`에 모여 있습니다.
- 앱 시작 시 `RootNavigator`가 `restoreSession()`을 실행하고 아래 순서로 화면을 결정합니다.

| 순서 | 조건                    | 화면                                             |
| ---- | ----------------------- | ------------------------------------------------ |
| 1    | 세션 복원 전            | `SplashLoadingScreen`                            |
| 2    | 미인증                  | `AuthNavigator` (로그인·회원가입)                |
| 3    | 인증됨 + 앱 잠금 미해제 | `AppLockStack` (PIN 입력)                        |
| 4    | 그 외                   | `MainNavigator` (온보딩 게이트 → 온보딩 또는 홈) |

DEV 전용 분기(상태 미리보기, 로그인 생략)도 있으나 현재 코드에서 모두 꺼져 있습니다. ([11장](#11-개발-및-시연-참고-사항) 참고)

---

## 4. 디렉터리 구조

주요 디렉터리와 핵심 파일만 표시했습니다.

```text
fintech-app-frontend/
├─ App.js                     # Redux Provider + GestureHandlerRootView + RootNavigator
├─ index.js                   # 진입점 (react-native-get-random-values 선로딩)
├─ app.json                   # Expo 앱 설정
├─ eas.json                   # EAS Build 프로필
├─ .env.example               # 환경 변수 예시
├─ assets/                    # 아이콘, 로그인·미래 프로필 이미지
├─ docs/
│  ├─ moaje-frontend-api-guide-20261011.pdf   # 백엔드 API 명세
│  └─ MOAJE_서비스_이용약관_v1_초안.md          # 이용약관 초안
├─ scripts/api-tests/         # Node 테스트, 모의 Gateway, smoke 테스트
└─ src/
   ├─ navigation/             # Root / Auth / Main 내비게이터, 온보딩 게이트
   ├─ screens/                # auth, asset, home, onboarding, work, profile, settings, status, dev ...
   ├─ components/             # 화면별 UI 컴포넌트 (asset, home, moneyRecap, onboarding, work ...)
   ├─ features/
   │  ├─ auth/                # authApi, authSlice, authStorage
   │  ├─ asset/               # bankingApi, assetAccountApi, cashflowApi, assetSlice
   │  ├─ onboarding/          # onboardingApi, 저장소 어댑터, 온보딩 훅
   │  ├─ moneyRecap/          # recapApi, 스토리 구성 로직
   │  └─ work/                # calendar / fds / readiness / simulator / spending API와 화면 로직
   ├─ services/               # apiClient, apiResponse, tokenService, apiErrorHandler
   ├─ store/                  # Redux store (auth, asset, work)
   ├─ constants/              # apiEndpoints, apiHeaders, apiCodes, routes ...
   ├─ utils/                  # idempotencyKey, losslessJson, 포맷터, 검증기 ...
   └─ theme/                  # colors, typography, spacing, radius, shadows
```

---

## 5. 시작하기

### 사전 준비

- **Node.js**: React Native 0.86과 Metro가 요구하는 범위인 `^20.19.4 || ^22.13.0 || ^24.3.0 || >=25.0.0` (`package-lock.json`의 engines 기준)
- npm
- 연동할 백엔드 Gateway (별도 저장소/환경에서 실행)
- Android 실행: Android Studio 에뮬레이터 또는 Android 기기
- iOS 시뮬레이터 실행: **macOS 환경 필요**

### 설치

```bash
npm install
```

### 환경 변수

`.env.example`을 복사해 프로젝트 루트에 `.env`를 만듭니다. (`.env`는 커밋하지 않습니다.)

| 변수                                              | 역할                                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`                        | Gateway 주소. **호스트와 포트까지만** 입력합니다 (예: `http://<호스트>:8080`). 엔드포인트 상수가 `/api/v1/...` 전체 경로를 가지고 있으므로 경로를 붙이지 않습니다. 비어 있으면 요청이 설정 오류로 거부됩니다. |
| `EXPO_PUBLIC_API_TIMEOUT`                         | 요청 타임아웃(ms). 미설정 시 `10000`                                                                                                                                                                          |
| `EXPO_PUBLIC_APP_NAME`, `EXPO_PUBLIC_APP_VERSION` | `.env.example`에 있으나 현재 소스에서 읽지 않음                                                                                                                                                               |

- `EXPO_PUBLIC_*` 값은 앱 번들에 포함되므로 토큰·PIN·비밀키를 넣지 않습니다.
- `.env`를 변경한 뒤에는 Metro를 다시 시작해야 반영됩니다.
- `localhost`는 앱이 실행되는 기기 자신을 가리킵니다.
  - Android 에뮬레이터에서 개발 PC의 서버에 접속할 때는 일반적으로 `10.0.2.2`를 사용합니다.
  - 실제 기기는 개발 PC의 LAN 주소를 사용하며 같은 네트워크에 있어야 합니다. 서버 바인딩·방화벽·HTTP 허용 여부도 확인해야 합니다.

### 앱 실행

```bash
npm start          # Expo 개발 서버
npm run android    # Android 에뮬레이터/기기
npm run ios        # iOS 시뮬레이터 (macOS 필요)
npm run web        # 웹
```

> 이 프로젝트는 `@expo/ui`, `react-native-reanimated` 4.x 등을 사용합니다. **Expo Go에서 정상 동작하는지는 확인하지 않았습니다.** 또한 `eas.json`에는 development 프로필(`developmentClient`)이 있으나 `package.json`에는 `expo-dev-client`가 없으므로, 개발 빌드 구성은 현재 설정만으로 검증되지 않았습니다. 웹 실행 역시 동작 여부를 확인하지 않았습니다.

---

## 6. 주요 사용자 흐름

**회원가입**

1. 로그인 화면 → 회원가입 → 이용약관·개인정보 처리 동의 (필수 2종)
2. 휴대폰 번호 입력 → 이름 입력 (SMS 인증 단계 없음)
3. PIN 6자리 설정 → 재입력 확인 → `register` 요청
4. 성공 시 로그인 상태가 되어 메인 화면으로 전환

**로그인 / 앱 잠금**

1. 휴대폰 번호 입력 → PIN 6자리 입력 → `login` 후 `/me`로 사용자 확인
2. 앱을 다시 실행하면 저장된 토큰으로 세션을 복원하지만, 앱 잠금이 활성화되어 있어 PIN 재입력(`session/unlock`) 후 진입합니다. 잠금 화면에서 로그아웃하고 다시 로그인할 수도 있습니다.

**온보딩 → 홈**

- 로그인 후 서버의 온보딩 진행 상태를 확인해 미완료면 재무 온보딩(질문 10개 제출 → 결과/미래 프로필), 완료면 홈으로 이동합니다.
- 홈에서 계좌·거래내역·송금·소비 분석, 카테고리 메뉴를 통해 Money Recap, 준비도, 시뮬레이터, 학기 소비, FDS 알림 등에 진입합니다.

**프로필**

- 내 정보 수정, PIN 변경(성공 시 서버에서 세션이 해지되어 새 PIN으로 재로그인), 로그아웃, 회원 탈퇴

---

## 7. API 통신 및 인증 구조

API 명세는 `docs/moaje-frontend-api-guide-20261011.pdf`입니다. 명세에 있어도 앱에서 호출하지 않는 엔드포인트는 위 기능 표에 포함하지 않았습니다. 운영자 전용 API(블랙리스트, 재방문 지표 등)는 호출하지 않습니다.

### 서비스별 응답 형식

서비스마다 응답 형태가 다르며 `src/services/apiResponse.js`가 경로 기준으로 구분합니다.

| 서비스         | 경로                                        | 정상 응답                                                                      | 앱의 처리                                                                                      |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Auth           | `/api/v1/auth/...`                          | Envelope `{ success, status, code, message, data, error, traceId, timestamp }` | `success`를 확인하고 `data`를 반환. 실패 시 `code`·`traceId`·`requiredAction`을 담은 오류 생성 |
| Banking, Asset | `/api/v1/banking/...`, `/api/v1/assets/...` | 객체 직접 반환                                                                 | 그대로 사용 (`responseFormat: 'raw'`)                                                          |
| Work           | `/api/v1/work/...`                          | 배열 또는 객체 직접 반환                                                       | 그대로 사용                                                                                    |

오류는 네트워크 미도달 / 타임아웃 / 4xx / 5xx / Auth 업무 오류로 구분됩니다.

### JWT 인증

- Access/Refresh Token은 `expo-secure-store`에 저장하고, Access Token은 메모리에도 캐시합니다.
- 보호된 API에는 `Authorization: Bearer <access_token>`을 자동 첨부합니다. 가입·로그인·refresh·logout·unlock 등 공개 경로에는 붙이지 않습니다.
- 401이며 토큰 만료로 판단되는 경우에만 `POST /api/v1/auth/refresh`를 호출합니다. 동시에 여러 요청이 만료되어도 refresh는 한 번만 실행(single-flight)하고, 원 요청은 최대 한 번만 재시도합니다. Refresh 전용 Axios 인스턴스를 사용해 재귀를 막습니다.
- Refresh가 4xx(408/429 제외)로 거절되면 세션 만료로 보고 토큰을 정리한 뒤 로그아웃 상태로 전환합니다. 네트워크·5xx 오류는 토큰을 유지합니다.
- 로그아웃은 서버 요청 성공 여부와 관계없이 로컬 토큰을 항상 삭제합니다.

### 송금과 멱등성

`POST /api/v1/banking/transfers`는 `Idempotency-Key`(UUID)를 보냅니다. 최초 요청 시 키를 정하고 재시도에서도 같은 키를 유지하며, 처리 중이거나 결과가 불확실한 송금이 있으면 새 송금을 막고 같은 키로 재확인합니다. 송금 상태(`ACCEPTED`/`PROCESSING`/`COMPLETED`/`FAILED`/`REVERSED`)는 구분해서 표시합니다.

### 큰 정수 ID

JavaScript `Number` 정밀도를 넘을 수 있는 ID를 위해 `src/utils/losslessJson.js`가 응답 JSON에서 16자리 이상 정수를 파싱 전에 문자열로 바꿉니다. 계좌·거래·FDS 알림 ID 등에 적용되며 전역 설정이 아니라 해당 API 호출에 개별 적용됩니다.

---

## 8. 상태 관리

Redux Toolkit store(`src/store/store.js`)에는 세 개의 슬라이스가 있습니다.

| 슬라이스 | 내용                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `auth`   | 사용자, 인증/세션 복원 여부, 앱 잠금 해제 여부(`isAppUnlocked`), 로그인·가입·로그아웃·프로필·PIN 변경·탈퇴·잠금 해제 thunk     |
| `asset`  | 계좌, 거래내역(커서), 거래 상세, 송금/미확정 송금, 계좌 개설, 하루 사용 가능 금액, 월별·카테고리 현금흐름                      |
| `work`   | 추천/일일 한도 thunk만 있고 현재 화면에서 사용하지 않음. 준비도·리캡·시뮬레이터·온보딩 등은 Redux 대신 화면별 세션/훅으로 관리 |

- Redux 상태 자체는 영속화하지 않습니다(redux-persist 없음). 세션 만료 시 `logout()`이 dispatch되어 상태가 초기화됩니다.
- 기기 저장소 사용: 토큰은 SecureStore, 로그아웃 진행 표시·하루 사용 가능 금액 캐시·온보딩 임시 저장 등은 AsyncStorage.

---

## 9. 테스트

테스트는 Node 내장 러너로 실행하며 별도 테스트 프레임워크는 없습니다. 모의 Gateway와 스텁(`scripts/api-tests/`)을 사용하므로 **실제 백엔드 통합 테스트를 대체하지 않습니다.**

```bash
# 공통 API 클라이언트, Auth, 로그아웃, 앱 잠금 관련 테스트 (6개 파일)
npm run test:api

# 실행 중인 Gateway에 대한 비파괴 도달 확인 (가입·송금·계좌 개설 등 변경 요청 없음)
npm run test:api:smoke -- http://<Gateway 주소>:8080

# 그 외 테스트 파일은 개별 실행
node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/<파일>.test.mjs
```

`scripts/api-tests/`에는 위 6개 외에도 자산·캐시플로·Work 기능·온보딩 등의 테스트 파일이 있지만 npm 스크립트에는 포함되어 있지 않습니다. 일부는 소스 문자열을 확인하는 연결(wiring) 테스트입니다.

코드 포맷:

```bash
npm run format:check
npm run format
```

---

## 10. 빌드

`eas.json`에는 세 개의 프로필이 정의되어 있으며, 각 프로필이 `EXPO_PUBLIC_API_BASE_URL`을 지정합니다.

| 프로필        | 배포                                | API 주소(설정값)                              |
| ------------- | ----------------------------------- | --------------------------------------------- |
| `development` | internal, `developmentClient: true` | `http://10.0.2.2:8080` (Android 에뮬레이터용) |
| `staging`     | internal                            | `https://api-staging.moaje.com`               |
| `production`  | store                               | `https://api.moaje.com`                       |

```bash
eas build --profile <development|staging|production> --platform <android|ios>
```

> 이 저장소에서 EAS 빌드가 성공하는지는 검증하지 않았습니다. `development` 프로필은 `expo-dev-client`가 설치되어 있지 않아 추가 설정이 필요할 수 있고, `staging`/`production`의 주소는 설정 파일에 적힌 값일 뿐 해당 서버의 존재를 보장하지 않습니다.

---

## 11. 개발 및 시연 참고 사항

- **DEV 전용 기능**: `src/navigation/RootNavigator.js`의 `ENABLE_DEV_STATE_PREVIEW`(상태 화면 미리보기)와 `ENABLE_DEV_MAIN`(로그인 생략)은 `__DEV__ && false`로 고정되어 있어 현재 비활성입니다. `src/screens/dev/`의 화면은 이 플래그를 켜야 접근할 수 있으며 일반 사용자 기능이 아닙니다. 별도의 `devConfig` 파일은 없습니다.
- **기능 플래그**: `WORK_ONBOARDING_ENABLED = true`(`src/features/onboarding/workOnboardingConfig.js`)로 서버 온보딩이 기본 경로입니다. 앱 잠금은 `unlock` 엔드포인트가 정의되어 있으면 활성화되며 현재 활성입니다.
- **Mock/미사용 코드**: `src/constants/moneyRecapMockData.js`는 어떤 파일에서도 import하지 않습니다. 이전 로컬 온보딩 구현과 일부 미사용 thunk(자산 요약, 가용 잔액, 추천)가 남아 있습니다.
- **미지원 기능**: PIN 재설정, 전용 계좌 목록 화면, MFA, 소득 최적화 추천, 설정 화면 대부분은 서버 연동 없이 "준비 중"입니다.
- **실서버 검증 범위**: 서버 응답 형식·API 동작은 명세서와 모의 테스트를 기준으로 작성되었으며, 전체 기능의 실서버 통합 검증 결과는 이 문서에 포함하지 않습니다. 명세와 실제 서버 동작이 다르면 코드에서 임의로 우회하지 않고 백엔드 확인을 거칩니다.
- **약관**: 서비스 이용약관 초안은 `docs/MOAJE_서비스_이용약관_v1_초안.md`에 있으며 시연용 초안입니다.

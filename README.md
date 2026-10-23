# Hotalink

有料老人ホーム向けの入居判定支援 Web アプリ（MVP）。

施設が登録した資料・追記と、家族アンケートの回答から、

- **ABCDE の入居判定**と、判定が低い原因
- **事前に説明すべき点**（家族の期待と施設の方針・本人の状態のずれ。ABCDE とは別枠）
- **同意書・契約書の特記事項の文案**

を出します。判定は判断材料で、入居の可否は施設の担当者が決めます。

## しくみ

| 役割 | 使うもの |
| --- | --- |
| 画面・API | Next.js（Vercel、東京リージョン `hnd1`） |
| ログイン | Firebase Authentication（メール＋パスワード） |
| データ | Cloud Firestore（東京リージョン） |
| 資料ファイル | Cloud Storage for Firebase |
| 資料の読み取り・自由記述の要約 | Claude API |

- **AI は読み取りだけ**：Claude は資料から項目を拾い、家族の自由記述を要約するだけです。点数付けと ABCDE は `src/lib/domain/judge.ts` の決まったルールで行うので、同じ入力なら必ず同じ結果になります。
- **施設ごとのデータ分離**：Firestore にはブラウザから直接アクセスできません（`firestore.rules`）。すべてサーバーの API が、ログイン情報（カスタムクレーム `facilityId`）で施設を確かめてから読み書きします。
- **家族アンケート**：ログイン不要。推測できないトークン付き URL（14日で失効、DB にはハッシュだけ保存）で守ります。家族側には設問と施設名だけを返します。
- **ANTHROPIC_API_KEY が無くても動きます**（資料の読み取りがダミーになります）。

## 判定のルール（概要）

1. **足切り**：受け入れ設定で「対応できない」とした項目に当たると D、2つ以上で E
2. **項目スコア**：医療・身体／転倒・認知／行動を 0〜10 で採点し、重み付きで 0〜100 のリスク点に
3. **ABCDE**：リスク点を境目（初期値 20 / 40 / 60）と比べて A〜D。転倒リスクがあれば A でも B（同意書が前提）
4. **期待値のずれ**：`本人の状態の重さ × 家族の考えと施設の方針のギャップ`。ABCDE には入れない

施設は「受け入れ設定」で、プリセット（標準／医療重視／認知症ケア重視）、境目、重み、ずれの表示量を変えられます。保存前に、最近の入居者の判定がどう変わるかを試算でき、変更履歴が残ります。各判定には使った設定のバージョンが記録されます。

## セットアップ

### 1. Firebase プロジェクト

1. [Firebase コンソール](https://console.firebase.google.com/)でプロジェクトを作成
2. **料金プランを Blaze（従量課金）に変更**（Cloud Storage に必要）。予算アラートも設定しておく
3. **Authentication** → ログイン方法で「メール / パスワード」を有効にする
4. **Firestore Database** を作成（ロケーション：`asia-northeast1`（東京）、本番モード）
5. **Storage** を作成（ロケーション：`asia-northeast1`）
6. プロジェクトの設定 → マイアプリ → **ウェブアプリを追加**し、表示された設定値を控える
7. プロジェクトの設定 → サービスアカウント → **新しい秘密鍵を生成**（JSON をダウンロード。GitHub には絶対に上げない）

### 2. ローカルで動かす

Node.js 22 が必要です（`node -v` で確認。古い場合は [nodejs.org](https://nodejs.org/ja) から LTS 版を入れる）。

```bash
npm install
cp .env.example .env.local   # 1 で控えた値を入れる
npx firebase login
npx firebase use --add        # 作ったプロジェクトを選ぶ
npx firebase deploy --only firestore:rules,storage   # セキュリティルールを反映
npm run create-staff -- --email you@example.com --password 'パスワード8文字以上' \
  --facility hidamari --role admin --facility-name "ひだまりの家"
npm run dev                   # http://localhost:3000
```

- `--facility` は施設ID（英小文字・数字・ハイフン）。同じ施設のスタッフには同じIDを使います
- `--role admin` は受け入れ設定を変更できます。`staff` は判定までです

### 3. Vercel に公開

1. Vercel で **Add New → Project** から、この GitHub リポジトリをインポート
2. **Environment Variables** に `.env.example` の項目をすべて登録（`FIREBASE_PRIVATE_KEY` は改行を `\n` にした1行で）
3. デプロイ後、`NEXT_PUBLIC_APP_URL` に本番の URL を入れて再デプロイ
4. Firebase コンソール → Authentication → 設定 → **承認済みドメイン**に Vercel のドメインを追加

関数のリージョンは `vercel.json` で東京（`hnd1`）にしています。Node.js は `package.json` の `engines` で 22.x に固定しています（古い Node.js だと firebase-admin の読み込みで `ERR_REQUIRE_ESM` になり、API が 500 を返します）。

## 開発

```bash
npm test        # 判定ロジックと API の通しテスト
npm run lint
npm run build
```

Firebase エミュレータを使う場合（Java が必要）は `npm run emulators` を起動し、`.env.local` の末尾にあるエミュレータ用の行を有効にしてください。Firestore の代わりにメモリ上の DB で試すだけなら `HOTALINK_MEMORY_DB=1` も使えます（開発時のみ有効。サーバーを止めると消えます）。

### ファイル構成

```
src/lib/domain/     判定ロジック・設問・型（純粋な TypeScript。テストあり）
src/lib/server/     Firebase Admin、データの読み書き、Claude 連携
src/app/api/        API（すべてサーバー側で認証）
src/app/(staff)/    施設スタッフの画面（入居者一覧・入居者詳細・受け入れ設定）
src/app/survey/     家族アンケート（ログイン不要・スマホ向け）
scripts/            スタッフアカウントの作成
```

## MVP に含めていないもの

- 面談の録音から議事録を作る機能（いまは面談メモを手で入力し、AI の読み取りに含める）
- 入居後のトラブル実績の記録と、判定の自動調整
- 前施設のトラブル情報を判定に使うこと（いまは共有メモとして保存のみ）
- 料金・契約まわり、複数施設をまとめる法人アカウント

## 注意

- 同意書・特記事項は**たたき台**です。実際の契約に使う前に弁護士の確認を受けてください。「免責」の書面にはしていません。
- 病歴などは要配慮個人情報です。取得の同意、外部 AI（Claude API）に送ることの説明、家族からの開示請求への対応を、運用開始前に整理してください。
- 開発中は実在の入居者の資料を使わず、架空のデータで試してください。

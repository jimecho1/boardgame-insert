# Boardgame Insert Generator

免費嘅網頁工具：輸入桌遊配件清單，自動生成可以 3D 打印嘅收納 insert（STL）。

- 網站：https://jimecho1.github.io/boardgame-insert/
- 純前端，唔使登入，唔使安裝

## 開發

需要 Node.js 22 或以上。

```bash
npm install
npm run dev      # 本機開發：http://localhost:5173/boardgame-insert/
npm test         # 單元測試 (Vitest)
npm run build    # 型別檢查 + 打包去 dist/
```

## 部署

每次 push 去 `main`，GitHub Actions（`.github/workflows/deploy.yml`）會自動跑測試、build，再發佈去 GitHub Pages。

## 結構

| Folder | 用途 |
|---|---|
| `src/layout/` | 配件尺寸計算同自動排位（純 TypeScript，有單元測試） |
| `src/geometry/` | 用 Manifold (WASM) 生成 tray 幾何 |
| `src/export/` | STL 匯出 |
| `src/main.ts` | UI 同 Three.js 預覽 |

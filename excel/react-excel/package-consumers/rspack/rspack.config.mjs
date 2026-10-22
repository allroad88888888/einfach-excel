import { rspack } from '@rspack/core'
import { readFileSync } from 'node:fs'
export default {
  mode: 'production', entry: './app.tsx', target: ['web', 'es2022'],
  output: { path: new URL('./dist', import.meta.url).pathname, publicPath: './', clean: true },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  experiments: { css: true },
  module: { rules: [
    { test: /\.tsx?$/, exclude: /node_modules/, loader: 'builtin:swc-loader',
      options: { jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } } } },
    { test: /\.css$/, type: 'css' },
    { test: /\.wasm$/, type: 'asset/inline' },
  ] },
  // Vite 使用源码 script；Rspack 由 Html 插件注入编译入口。
  plugins: [new rspack.HtmlRspackPlugin({ inject: 'body', templateContent:
    readFileSync(new URL('./index.html', import.meta.url), 'utf8')
      .replace('<script type="module" src="./app.tsx"></script>', '') })],
}

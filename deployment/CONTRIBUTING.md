# Chiyo Analytics Deployment Script Contributing Guide

## How to build
我们使用 [shiv](https://github.com/linkedin/shiv) 把多个 `.py` 文件打包成一个 zipapp

你需要现在 project-root 中使用 `uv sync` 来安装 shiv，然后运行如下命令
```sh
../.venv/bin/python3 build.py
```

构建后的产物在 `dist` 文件夹中

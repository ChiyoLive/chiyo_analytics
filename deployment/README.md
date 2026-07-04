# Chiyo Analytics Single Server Deploy
这个仓库提供一个 python zipapp (使用 [shiv](https://github.com/linkedin/shiv) 打包) 来让用户安装 cyanly 到他们的电脑

# Quick Start

**1.**
创建模板 chiyo_analytics.toml 配置文件
```sh
python3 install-cyanly.pyz configure
```

**2.**
使用 vim 或 nano 修改 chiyo_analytics.toml 配置文件
```sh
vim ./cyanly-preinstall/chiyo_analytics.toml
```

**3.**
安装需要的文件到指定目录并启动服务
```sh
python3 install-cyanly.pyz install
# 或者指定安装位置
python3 install-cyanly.pyz install --dest ~/.cyanly
```

- 默认安装到 `~/.cyanly`
- 安装动做会自动做以下几件事情
    - 根据 chiyo_analytics.toml 自动生成 docker-compose.yaml 文件
    - 根据 chiyo_analytics.toml 自动生成 .env 文件
    - 释放一个快捷管理脚本 `cyanly.pyz` 到安装目录下
- 安装完成后你可以在目标文件夹下直接使用 `docker` 命令行或者 `python3 cyanly.pyz` 来管理项目
    - `cyanly.pyz` 的管理脚本包含了 `uninstall`, `uninstall --volume`, `restart <service_name>`, `up <service_name>` 等快捷命令


# Q&A
## Why python?
比起 shell script，python 有如下好处
1. 更加现代，代码更易管理
2. 平台无关
3. 现代主流 linux 发行版都自带了一个 python3 解释器，只要使用不带 c 拓展的纯 py，那么使用单文件 python 脚本的心智负担已经基本和 shell script 持平

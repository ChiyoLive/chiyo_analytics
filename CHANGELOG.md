# v1.1.1
## new
- install-cyanly.pyz 新增 [--config path/to/chiyo_analytics.toml] 选项

## fix
- dashbaord：
    - 修复了没有权限的用户登陆 dashboard 时会直接渲染错误页面的问题。新增了一个骨架屏引导用户创建或联系管理员授予权限。

## fix
- 修复了 install-cyanly.pyz 生成的 docker-compose.yaml 丢失格式的问题

# v1.1.0
## new
- chiyo_analytics.toml 新增配置项
    - redis, postgres, clickhouse 新增： deploy.single_server_docker 选项。允许配置绑定的本机端口，挂载的 volume 配置等等
    - collector, api 的 cors_allowed_origins 允许使用通配符。

# v1.0.1
## fix
- 修复了 single server docker 部署的管理 CLI 不尊重安装 CLI 的 --dest 参数的问题

# v1.0.0
首次发布

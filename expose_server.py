from pyngrok import ngrok

# 设置pyngrok的日志级别
import logging
logging.basicConfig(level=logging.INFO)

# 暴露本地的8000端口
tunnel = ngrok.connect(8000, "http")

# 打印公网URL
print("\n")
print("========================================")
print("TaskPool 应用公网访问地址：")
print(tunnel.public_url)
print("========================================")
print("\n")
print("将以上地址复制到手机浏览器中即可访问应用程序")
print("注意：此地址会在脚本关闭后失效")
print("\n")

# 保持脚本运行
input("按Enter键关闭公网访问...")

# 关闭隧道
ngrok.disconnect(tunnel.public_url)
print("公网访问已关闭")

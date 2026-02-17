import requests
import json

def main():
    # 目标 URL
    url = "https://tw.ncsoft.com/aion2/api/search/aion2tw/search/v2/character"
    
    # 查询参数
    params = {
        "keyword": "燃烧的浅蓝",  # 中文会自动进行 URL 编码
        "race": "",
        "serverId": ""
    }
    
    # 设置请求头，模拟浏览器访问（部分 API 需要 User-Agent）
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    try:
        # 发送 GET 请求
        response = requests.get(url, params=params, headers=headers, timeout=10)
        
        # 检查 HTTP 状态码
        response.raise_for_status()  # 如果状态码不是 200，会抛出 HTTPError
        
        print(f"请求成功！状态码: {response.status_code}")
        
        # 尝试解析 JSON 响应
        try:
            data = response.json()
            print("响应内容（JSON 格式）:")
            print(json.dumps(data, indent=4, ensure_ascii=False))
        except json.JSONDecodeError:
            # 如果不是 JSON，则直接输出文本
            print("响应内容（文本格式）:")
            print(response.text)
            
    except requests.exceptions.Timeout:
        print("请求超时，请检查网络或稍后重试。")
    except requests.exceptions.ConnectionError:
        print("网络连接错误，请检查网络。")
    except requests.exceptions.HTTPError as err:
        print(f"HTTP 错误: {err}")
    except requests.exceptions.RequestException as e:
        print(f"请求发生异常: {e}")

if __name__ == "__main__":
    main()
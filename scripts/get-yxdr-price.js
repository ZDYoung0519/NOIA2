fetch("https://gw.7881.com/goods-service-api/api/goods/list", {
  "headers": {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "content-type": "application/json",
    "lb-sign": "f658112347dbe04504a11d956db5ba65",
    "lb-timestamp": "1776923392524",
    "sec-ch-ua": "\"Microsoft Edge\";v=\"147\", \"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"147\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "cookie": "",
    "Referer": "https://search.7881.com/"
  },
  "body": "{\"marketRequestSource\":\"search\",\"sellerType\":\"C\",\"gameId\":\"G6212\",\"gtid\":\"100001\",\"groupId\":\"G6212P002\",\"tradePlace\":\"0\",\"goodsSortType\":\"1\",\"extendAttrList\":[],\"pageNum\":1,\"pageSize\":30}",
  "method": "POST"
}).then(response => response.json())
.then(data => {
  console.log(data);  // 打印完整数据
  console.log(JSON.stringify(data, null, 2));  // 格式化打印
})
.catch(error => console.error('Error:', error));;
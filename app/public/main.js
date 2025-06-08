// public/main.js
axios.interceptors.request.use((config) => {
    const apiKey = localStorage.getItem("pdfify_api_key");
    const shopifyToken = localStorage.getItem("shopify_access_token");
  
    if (apiKey) {
      config.headers["x-api-key"] = apiKey;
    }
    if (shopifyToken) {
      config.headers["shopify-access-token"] = shopifyToken;
    }
  
    return config;
  }, (error) => {
    return Promise.reject(error);
  });
  
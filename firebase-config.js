// Firebase配置文件
// 注意：这是示例配置，实际使用时需要替换为真实的Firebase项目配置
const firebaseConfig = {
    apiKey: "AIzaSyC9zYw5Q4R1z6t7X8b9c3d2e1f0g7h6i5j4k3l2m1n0",
    authDomain: "taskpool-website.firebaseapp.com",
    databaseURL: "https://taskpool-website-default-rtdb.firebaseio.com",
    projectId: "taskpool-website",
    storageBucket: "taskpool-website.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:1a2b3c4d5e6f7g8h9i0j"
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { firebaseConfig };
}
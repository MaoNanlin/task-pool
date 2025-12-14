// 应用配置文件
const AppConfig = {
    // 应用信息
    appName: 'TaskPool',
    appVersion: '2.1.0',
    appDescription: '任务管理系统',
    
    // 服务器配置（模拟）
    server: {
        apiBaseUrl: '/api',
        timeout: 10000,
        retryCount: 3
    },
    
    // 本地存储配置
    storage: {
        prefix: 'taskpool_',
        encryption: false
    },
    
    // 功能开关
    features: {
        wechatLogin: true,
        phoneLogin: true,
        emailLogin: true,
        autoSync: true,
        reminders: true
    },
    
    // 主题配置
    theme: {
        primaryColor: '#3b82f6',
        darkMode: false
    },
    
    // 任务配置
    tasks: {
        maxLevel: 3,
        defaultPriority: 'medium',
        reminderThreshold: 3600000 // 1小时（毫秒）
    },
    
    // 安全配置
    security: {
        sessionTimeout: 7 * 24 * 60 * 60 * 1000, // 7天
        tokenAlgorithm: 'base64'
    }
};

// GitHub同步配置
const GITHUB_CONFIG = {
    GITHUB_TOKEN: '', // 请在应用中设置GitHub Personal Access Token
    GIST_ID: '',               // 请在应用中设置Gist ID
    SYNC_INTERVAL: 5, // 默认同步间隔（分钟）
    SYNC_ENABLED: true // 默认启用同步
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppConfig;
}
# GitHub Gist 同步方案详细指南

## 1. GitHub Gist 同步原理

### 1.1 技术架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   设备A (PC)    │     │  GitHub Gist    │     │   设备B (手机)  │
│  TaskPool应用   │◄───►│  云存储服务    │◄───►│  TaskPool应用   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        ▲                      ▲                      ▲
        │                      │                      │
        ▼                      ▼                      ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 本地存储        │     │  GitHub API     │     │ 本地存储        │
│ localStorage    │     │  RESTful API    │     │ localStorage    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 1.2 核心概念

- **GitHub Gist**：GitHub提供的代码片段分享服务，支持私有存储
- **Personal Access Token**：GitHub的认证令牌，用于API访问授权
- **RESTful API**：通过HTTP请求与GitHub服务交互
- **JSON格式**：任务数据的存储格式
- **冲突解决**：处理多设备同时修改数据的冲突情况

## 2. 前期准备

### 2.1 GitHub账号注册

1. 访问 [GitHub官网](https://github.com)
2. 点击右上角的"Sign up"按钮
3. 填写邮箱、用户名、密码等信息
4. 完成邮箱验证和注册流程

### 2.2 创建Personal Access Token

**详细步骤：**

1. 登录GitHub账号
2. 点击右上角头像 → Settings
3. 在左侧菜单中选择 **Developer settings**
4. 选择 **Personal access tokens** → **Tokens (classic)**
5. 点击右上角的 **Generate new token** → **Generate new token (classic)**
6. 填写表单：
   - **Note**: 输入描述（如"TaskPool Sync Token"）
   - **Expiration**: 选择过期时间（建议选择"Never"避免频繁更新）
   - **Select scopes**: 只勾选 `gist` 权限（最小权限原则）
7. 滚动到底部，点击 **Generate token**
8. **重要**：复制生成的token并保存，离开页面后将无法再次查看

### 2.3 创建私有Gist

**详细步骤：**

1. 访问 [Gist页面](https://gist.github.com)
2. 填写Gist信息：
   - **Filename including extension**: 输入 `taskpool-data.json`
   - **Description**: 输入描述（如"TaskPool任务数据存储"）
   - **内容区域**: 输入初始JSON数据（见下方示例）
3. 选择 **Create secret gist**（创建私有Gist）
4. 创建成功后，从URL中获取Gist ID：
   ```
   https://gist.github.com/yourusername/abc123def456ghi789jkl0
   ```
   其中 `abc123def456ghi789jkl0` 就是Gist ID

**初始JSON数据示例：**
```json
{
  "tasks": [],
  "lastSync": "2024-01-01T00:00:00.000Z",
  "version": "1.0",
  "deviceInfo": "TaskPool Initial Data"
}
```

## 3. 代码实现详解

### 3.1 GitHubSyncManager 类

```javascript
class GitHubSyncManager {
  constructor(token, gistId) {
    this.token = token;           // GitHub Personal Access Token
    this.gistId = gistId;         // Gist ID
    this.apiUrl = `https://api.github.com/gists/${gistId}`;  // GitHub API URL
    this.lastSyncTime = null;     // 上次同步时间
    this.isSyncing = false;       // 同步状态标志
  }
  
  // 获取GitHub API请求头
  getAuthHeaders() {
    return {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
  }
  
  // 检查Token和Gist ID是否有效
  async validateCredentials() {
    try {
      const response = await fetch(this.apiUrl, {
        headers: this.getAuthHeaders()
      });
      
      if (response.ok) {
        const gist = await response.json();
        // 检查是否包含我们的数据文件
        if (gist.files && gist.files['taskpool-data.json']) {
          return { valid: true, message: '凭证有效' };
        } else {
          return { valid: false, message: 'Gist中未找到taskpool-data.json文件' };
        }
      } else if (response.status === 401) {
        return { valid: false, message: 'GitHub Token无效或已过期' };
      } else if (response.status === 404) {
        return { valid: false, message: 'Gist ID不存在' };
      } else {
        return { valid: false, message: `验证失败: ${response.status}` };
      }
    } catch (error) {
      return { valid: false, message: `网络错误: ${error.message}` };
    }
  }
  
  // 获取远程数据
  async fetchRemoteData() {
    try {
      const response = await fetch(this.apiUrl, {
        headers: this.getAuthHeaders()
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Gist不存在或无访问权限');
        } else if (response.status === 401) {
          throw new Error('GitHub Token无效');
        } else {
          throw new Error(`获取远程数据失败: ${response.status}`);
        }
      }
      
      const gist = await response.json();
      
      // 检查是否包含我们的数据文件
      if (!gist.files || !gist.files['taskpool-data.json']) {
        // 如果文件不存在，创建一个新的
        await this.createDataFile();
        return { tasks: [], lastSync: new Date().toISOString(), version: '1.0' };
      }
      
      const content = gist.files['taskpool-data.json'].content;
      const data = JSON.parse(content);
      
      // 验证数据格式
      if (!data.tasks || !Array.isArray(data.tasks)) {
        throw new Error('远程数据格式无效');
      }
      
      return data;
    } catch (error) {
      console.error('获取远程数据错误:', error);
      throw error;
    }
  }
  
  // 创建数据文件
  async createDataFile() {
    const initialData = {
      tasks: [],
      lastSync: new Date().toISOString(),
      version: '1.0'
    };
    
    try {
      const response = await fetch(this.apiUrl, {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          files: {
            'taskpool-data.json': {
              content: JSON.stringify(initialData, null, 2)
            }
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`创建数据文件失败: ${response.status}`);
      }
      
      console.log('数据文件创建成功');
    } catch (error) {
      console.error('创建数据文件错误:', error);
      throw error;
    }
  }
  
  // 上传本地数据
  async uploadLocalData(data) {
    try {
      const uploadData = {
        ...data,
        lastSync: new Date().toISOString(),
        version: '1.0',
        deviceInfo: {
          name: navigator.userAgent,
          syncTime: new Date().toISOString()
        }
      };
      
      const response = await fetch(this.apiUrl, {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          files: {
            'taskpool-data.json': {
              content: JSON.stringify(uploadData, null, 2)
            }
          }
        })
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('GitHub Token无效或已过期');
        } else if (response.status === 404) {
          throw new Error('Gist不存在或无访问权限');
        } else {
          throw new Error(`上传数据失败: ${response.status}`);
        }
      }
      
      this.lastSyncTime = new Date().toISOString();
      
      // 保存同步时间到本地
      localStorage.setItem('taskpool_last_sync', this.lastSyncTime);
      
      console.log('数据上传成功');
      return true;
    } catch (error) {
      console.error('上传数据错误:', error);
      throw error;
    }
  }
  
  // 冲突解决策略
  resolveConflict(localData, remoteData) {
    // 确保数据结构完整
    localData = localData || { tasks: [], lastSync: null };
    remoteData = remoteData || { tasks: [], lastSync: null };
    
    const localTime = localData.lastSync ? new Date(localData.lastSync) : new Date(0);
    const remoteTime = remoteData.lastSync ? new Date(remoteData.lastSync) : new Date(0);
    
    console.log('冲突检测:');
    console.log('- 本地时间:', localTime);
    console.log('- 远程时间:', remoteTime);
    
    // 策略1: 以最新数据为准
    if (remoteTime > localTime) {
      console.log('选择远程数据（更新）');
      return remoteData;
    } else if (localTime > remoteTime) {
      console.log('选择本地数据（更新）');
      return localData;
    } else {
      // 时间相同时，合并数据
      console.log('时间相同，合并数据');
      
      // 创建任务映射，便于快速查找
      const taskMap = new Map();
      
      // 先添加本地任务
      localData.tasks.forEach(task => {
        taskMap.set(task.id, { ...task, source: 'local' });
      });
      
      // 再添加远程任务，如果ID相同则比较更新时间
      remoteData.tasks.forEach(task => {
        const existingTask = taskMap.get(task.id);
        if (existingTask) {
          const existingTime = new Date(existingTask.updatedAt || existingTask.createdAt);
          const remoteTaskTime = new Date(task.updatedAt || task.createdAt);
          
          if (remoteTaskTime > existingTime) {
            taskMap.set(task.id, { ...task, source: 'remote' });
          }
        } else {
          taskMap.set(task.id, { ...task, source: 'remote' });
        }
      });
      
      // 转换回数组
      const mergedTasks = Array.from(taskMap.values());
      
      return {
        tasks: mergedTasks,
        lastSync: new Date().toISOString(),
        version: '1.0',
        conflictResolved: true,
        resolutionTime: new Date().toISOString()
      };
    }
  }
  
  // 获取本地数据
  getLocalData() {
    try {
      const tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
      const lastSync = localStorage.getItem('taskpool_last_sync');
      
      return {
        tasks: tasks,
        lastSync: lastSync,
        version: '1.0',
        deviceInfo: {
          name: navigator.userAgent,
          lastLocalUpdate: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('获取本地数据错误:', error);
      return { tasks: [], lastSync: null, version: '1.0' };
    }
  }
  
  // 保存数据到本地
  saveLocalData(data) {
    try {
      if (data.tasks && Array.isArray(data.tasks)) {
        localStorage.setItem('tasks', JSON.stringify(data.tasks));
        if (data.lastSync) {
          localStorage.setItem('taskpool_last_sync', data.lastSync);
        }
        console.log('数据已保存到本地');
        return true;
      } else {
        throw new Error('无效的数据格式');
      }
    } catch (error) {
      console.error('保存本地数据错误:', error);
      throw error;
    }
  }
  
  // 执行完整同步
  async sync() {
    if (this.isSyncing) {
      console.log('同步已在进行中');
      return { success: false, message: '同步已在进行中' };
    }
    
    this.isSyncing = true;
    
    try {
      console.log('开始同步...');
      
      // 步骤1: 获取远程数据
      console.log('步骤1: 获取远程数据');
      const remoteData = await this.fetchRemoteData();
      
      // 步骤2: 获取本地数据
      console.log('步骤2: 获取本地数据');
      const localData = this.getLocalData();
      
      // 步骤3: 解决冲突
      console.log('步骤3: 解决冲突');
      const resolvedData = this.resolveConflict(localData, remoteData);
      
      // 步骤4: 更新本地存储
      console.log('步骤4: 更新本地存储');
      this.saveLocalData(resolvedData);
      
      // 步骤5: 上传解决后的数据
      console.log('步骤5: 上传数据到Gist');
      await this.uploadLocalData(resolvedData);
      
      console.log('同步完成');
      
      return { 
        success: true, 
        message: '同步成功',
        syncedTasks: resolvedData.tasks.length,
        lastSync: resolvedData.lastSync,
        conflictResolved: resolvedData.conflictResolved || false
      };
    } catch (error) {
      console.error('同步错误:', error);
      return { 
        success: false, 
        message: error.message || '同步失败',
        error: error.toString()
      };
    } finally {
      this.isSyncing = false;
    }
  }
  
  // 仅下载数据（不上传）
  async downloadOnly() {
    try {
      console.log('开始下载数据...');
      
      const remoteData = await this.fetchRemoteData();
      this.saveLocalData(remoteData);
      
      console.log('数据下载完成');
      
      return {
        success: true,
        message: '数据下载成功',
        downloadedTasks: remoteData.tasks.length,
        lastSync: remoteData.lastSync
      };
    } catch (error) {
      console.error('下载数据错误:', error);
      return {
        success: false,
        message: error.message || '下载失败'
      };
    }
  }
  
  // 仅上传数据（不下载）
  async uploadOnly() {
    try {
      console.log('开始上传数据...');
      
      const localData = this.getLocalData();
      await this.uploadLocalData(localData);
      
      console.log('数据上传完成');
      
      return {
        success: true,
        message: '数据上传成功',
        uploadedTasks: localData.tasks.length,
        lastSync: this.lastSyncTime
      };
    } catch (error) {
      console.error('上传数据错误:', error);
      return {
        success: false,
        message: error.message || '上传失败'
      };
    }
  }
}
```

### 3.2 同步配置管理类

```javascript
class SyncConfigManager {
  constructor() {
    this.configKey = 'taskpool_sync_config';
    this.defaultConfig = {
      type: 'github',
      token: '',
      gistId: '',
      autoSync: false,
      syncInterval: 5, // 分钟
      lastSync: null,
      syncStatus: 'not_configured', // not_configured, configured, syncing, synced, error
      errorMessage: ''
    };
  }
  
  // 获取当前配置
  getConfig() {
    try {
      const config = localStorage.getItem(this.configKey);
      return config ? JSON.parse(config) : { ...this.defaultConfig };
    } catch (error) {
      console.error('获取配置错误:', error);
      return { ...this.defaultConfig };
    }
  }
  
  // 保存配置
  saveConfig(config) {
    try {
      const newConfig = {
        ...this.getConfig(),
        ...config,
        updatedAt: new Date().toISOString()
      };
      
      localStorage.setItem(this.configKey, JSON.stringify(newConfig));
      console.log('同步配置已保存');
      return newConfig;
    } catch (error) {
      console.error('保存配置错误:', error);
      throw error;
    }
  }
  
  // 清除配置
  clearConfig() {
    try {
      localStorage.removeItem(this.configKey);
      localStorage.removeItem('taskpool_last_sync');
      console.log('同步配置已清除');
    } catch (error) {
      console.error('清除配置错误:', error);
    }
  }
  
  // 验证配置有效性
  validateConfig(config) {
    const errors = [];
    
    if (!config.token || config.token.trim() === '') {
      errors.push('GitHub Token不能为空');
    }
    
    if (!config.gistId || config.gistId.trim() === '') {
      errors.push('Gist ID不能为空');
    }
    
    if (config.syncInterval && (isNaN(config.syncInterval) || config.syncInterval < 1)) {
      errors.push('同步间隔必须大于0分钟');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
  
  // 更新同步状态
  updateSyncStatus(status, message = '') {
    const config = this.getConfig();
    config.syncStatus = status;
    
    if (message) {
      config.errorMessage = message;
    }
    
    if (status === 'synced') {
      config.lastSync = new Date().toISOString();
      config.errorMessage = '';
    }
    
    this.saveConfig(config);
  }
  
  // 导出配置（用于备份）
  exportConfig() {
    const config = this.getConfig();
    // 移除敏感信息
    const exportConfig = { ...config };
    delete exportConfig.token;
    
    const dataStr = JSON.stringify(exportConfig, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `taskpool-sync-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  // 导入配置
  importConfig(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const config = JSON.parse(e.target.result);
          
          // 验证导入的配置
          if (config.type !== 'github') {
            throw new Error('不支持的配置类型');
          }
          
          // 保留当前的token（如果有）
          const currentConfig = this.getConfig();
          if (currentConfig.token) {
            config.token = currentConfig.token;
          }
          
          const validation = this.validateConfig(config);
          if (!validation.valid) {
            throw new Error(validation.errors.join(', '));
          }
          
          this.saveConfig(config);
          resolve({ success: true, message: '配置导入成功' });
        } catch (error) {
          reject({ success: false, message: `导入失败: ${error.message}` });
        }
      };
      
      reader.onerror = () => {
        reject({ success: false, message: '文件读取失败' });
      };
      
      reader.readAsText(file);
    });
  }
}
```

## 4. 用户界面实现

### 4.1 同步配置界面

```html
<!-- GitHub同步配置模态框 -->
<div id="githubSyncModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center hidden">
  <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 animate-slide-in">
    <div class="flex items-center justify-between mb-6">
      <h3 class="text-xl font-bold text-gray-800">GitHub 同步配置</h3>
      <button id="closeGithubSyncModal" class="text-gray-400 hover:text-gray-600">
        <i class="fa fa-times text-xl"></i>
      </button>
    </div>
    
    <div class="space-y-4">
      <!-- GitHub Token -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">GitHub Personal Access Token</label>
        <div class="relative">
          <input type="password" id="githubToken" class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="输入GitHub Token">
          <button id="toggleTokenVisibility" class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <i class="fa fa-eye"></i>
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-1">Token需要gist权限，用于读写Gist数据</p>
      </div>
      
      <!-- Gist ID -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Gist ID</label>
        <input type="text" id="gistId" class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="输入Gist ID">
        <p class="text-xs text-gray-500 mt-1">Gist ID是URL中的字符串，如：https://gist.github.com/username/<span class="font-mono bg-gray-100 px-1">abc123def456</span></p>
      </div>
      
      <!-- 自动同步设置 -->
      <div class="border-t pt-4">
        <label class="flex items-center">
          <input type="checkbox" id="autoSync" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
          <span class="ml-2 text-sm text-gray-700">启用自动同步</span>
        </label>
      </div>
      
      <div id="syncIntervalContainer" class="hidden">
        <label class="block text-sm font-medium text-gray-700 mb-1">同步间隔</label>
        <select id="syncInterval" class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
          <option value="1">1分钟</option>
          <option value="5" selected>5分钟</option>
          <option value="15">15分钟</option>
          <option value="30">30分钟</option>
          <option value="60">1小时</option>
        </select>
      </div>
      
      <!-- 同步操作按钮 -->
      <div class="flex space-x-3 pt-4">
        <button id="testGithubConnection" class="flex-1 px-4 py-2 border border-blue-500 text-blue-500 rounded-lg hover:bg-blue-50 transition-colors">
          测试连接
        </button>
        <button id="saveGithubConfig" class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
          保存配置
        </button>
      </div>
      
      <!-- 高级操作 -->
      <div class="border-t pt-4">
        <h4 class="text-sm font-medium text-gray-700 mb-2">高级操作</h4>
        <div class="flex space-x-2">
          <button id="downloadFromGithub" class="flex-1 px-3 py-1.5 text-sm border border-green-500 text-green-500 rounded hover:bg-green-50 transition-colors">
            <i class="fa fa-download mr-1"></i> 仅下载
          </button>
          <button id="uploadToGithub" class="flex-1 px-3 py-1.5 text-sm border border-purple-500 text-purple-500 rounded hover:bg-purple-50 transition-colors">
            <i class="fa fa-upload mr-1"></i> 仅上传
          </button>
          <button id="clearGithubConfig" class="flex-1 px-3 py-1.5 text-sm border border-red-500 text-red-500 rounded hover:bg-red-50 transition-colors">
            <i class="fa fa-trash mr-1"></i> 清除
          </button>
        </div>
      </div>
      
      <!-- 状态信息 -->
      <div id="githubSyncStatus" class="text-sm text-gray-600 mt-4 p-3 bg-gray-50 rounded-lg hidden">
        <!-- 状态信息将通过JavaScript动态填充 -->
      </div>
    </div>
    
    <!-- 帮助链接 -->
    <div class="mt-6 pt-4 border-t text-xs text-gray-500">
      <p>需要帮助？查看 <a href="#" id="showGithubSyncHelp" class="text-blue-500 hover:underline">详细教程</a></p>
    </div>
  </div>
</div>

<!-- GitHub同步帮助模态框 -->
<div id="githubSyncHelpModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center hidden">
  <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 animate-slide-in max-h-[80vh] overflow-y-auto">
    <div class="flex items-center justify-between mb-6">
      <h3 class="text-xl font-bold text-gray-800">GitHub 同步使用教程</h3>
      <button id="closeGithubSyncHelpModal" class="text-gray-400 hover:text-gray-600">
        <i class="fa fa-times text-xl"></i>
      </button>
    </div>
    
    <div class="space-y-6">
      <!-- 步骤1 -->
      <div>
        <h4 class="text-lg font-semibold text-gray-800 mb-2">步骤1: 创建GitHub账号</h4>
        <ol class="list-decimal pl-5 space-y-2 text-sm text-gray-600">
          <li>访问 <a href="https://github.com" target="_blank" class="text-blue-500 hover:underline">GitHub官网</a></li>
          <li>点击右上角的"Sign up"按钮</li>
          <li>填写邮箱、用户名、密码等信息</li>
          <li>完成邮箱验证和注册流程</li>
        </ol>
      </div>
      
      <!-- 步骤2 -->
      <div>
        <h4 class="text-lg font-semibold text-gray-800 mb-2">步骤2: 创建Personal Access Token</h4>
        <ol class="list-decimal pl-5 space-y-2 text-sm text-gray-600">
          <li>登录GitHub账号</li>
          <li>点击右上角头像 → Settings</li>
          <li>在左侧菜单中选择 <strong>Developer settings</strong></li>
          <li>选择 <strong>Personal access tokens</strong> → <strong>Tokens (classic)</strong></li>
          <li>点击右上角的 <strong>Generate new token</strong> → <strong>Generate new token (classic)</strong></li>
          <li>填写表单：
            <ul class="list-disc pl-5 mt-1">
              <li><strong>Note</strong>: 输入描述（如"TaskPool Sync Token"）</li>
              <li><strong>Expiration</strong>: 建议选择"Never"</li>
              <li><strong>Select scopes</strong>: 只勾选 <code>gist</code> 权限</li>
            </ul>
          </li>
          <li>点击 <strong>Generate token</strong></li>
          <li><strong>重要</strong>：复制生成的token并保存</li>
        </ol>
        <div class="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <i class="fa fa-exclamation-triangle mr-1"></i> 
          Token只会显示一次，请务必保存好！
        </div>
      </div>
      
      <!-- 步骤3 -->
      <div>
        <h4 class="text-lg font-semibold text-gray-800 mb-2">步骤3: 创建私有Gist</h4>
        <ol class="list-decimal pl-5 space-y-2 text-sm text-gray-600">
          <li>访问 <a href="https://gist.github.com" target="_blank" class="text-blue-500 hover:underline">Gist页面</a></li>
          <li>填写Gist信息：
            <ul class="list-disc pl-5 mt-1">
              <li><strong>Filename</strong>: <code>taskpool-data.json</code></li>
              <li><strong>Description</strong>: 任意描述</li>
              <li><strong>内容</strong>: 复制下方的JSON数据</li>
            </ul>
          </li>
          <li>选择 <strong>Create secret gist</strong></li>
          <li>从URL中复制Gist ID</li>
        </ol>
        <div class="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <code class="text-xs">
            {<br>
            &nbsp;&nbsp;"tasks": [],<br>
            &nbsp;&nbsp;"lastSync": "2024-01-01T00:00:00.000Z",<br>
            &nbsp;&nbsp;"version": "1.0"<br>
            }
          </code>
        </div>
      </div>
      
      <!-- 步骤4 -->
      <div>
        <h4 class="text-lg font-semibold text-gray-800 mb-2">步骤4: 配置TaskPool</h4>
        <ol class="list-decimal pl-5 space-y-2 text-sm text-gray-600">
          <li>在TaskPool中打开同步设置</li>
          <li>粘贴GitHub Token和Gist ID</li>
          <li>点击"测试连接"验证配置</li>
          <li>点击"保存配置"</li>
          <li>开启自动同步（可选）</li>
        </ol>
      </div>
      
      <!-- 常见问题 -->
      <div>
        <h4 class="text-lg font-semibold text-gray-800 mb-2">常见问题</h4>
        <div class="space-y-2 text-sm text-gray-600">
          <p><strong>Q: Token安全吗？</strong><br>
          A: Token只保存在本地，不会上传到任何服务器。请确保在公共设备上使用后清除配置。</p>
          
          <p><strong>Q: 数据隐私如何保障？</strong><br>
          A: 使用私有Gist，只有知道Token和Gist ID的人才能访问数据。</p>
          
          <p><strong>Q: 同步失败怎么办？</strong><br>
          A: 检查网络连接、Token有效性和Gist ID是否正确。如果问题持续，请尝试重新生成Token。</p>
        </div>
      </div>
    </div>
  </div>
</div>
```

### 4.2 同步状态指示器

```html
<!-- 同步状态指示器 -->
<div id="syncStatusIndicator" class="fixed bottom-4 right-4 z-40 hidden">
  <div class="bg-white rounded-full shadow-lg p-3 cursor-pointer hover:shadow-xl transition-shadow" id="syncStatusButton">
    <div class="flex items-center space-x-2">
      <div id="syncStatusIcon" class="w-2 h-2 rounded-full bg-gray-400"></div>
      <span id="syncStatusText" class="text-sm font-medium text-gray-700">未配置</span>
    </div>
  </div>
  
  <!-- 同步状态下拉菜单 -->
  <div id="syncStatusMenu" class="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-xl p-4 w-64 hidden">
    <h4 class="text-sm font-semibold text-gray-800 mb-2">同步状态</h4>
    
    <div class="space-y-2 text-xs text-gray-600">
      <div class="flex justify-between">
        <span>状态:</span>
        <span id="syncStatusDetail" class="font-medium">未配置</span>
      </div>
      <div class="flex justify-between">
        <span>上次同步:</span>
        <span id="syncLastTime">从未</span>
      </div>
      <div class="flex justify-between">
        <span>同步模式:</span>
        <span id="syncMode">手动</span>
      </div>
      <div class="flex justify-between">
        <span>任务数量:</span>
        <span id="syncTaskCount">0</span>
      </div>
    </div>
    
    <div class="border-t mt-3 pt-3 space-y-2">
      <button id="syncNowBtn" class="w-full text-left px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
        <i class="fa fa-refresh mr-1"></i> 立即同步
      </button>
      <button id="openSyncSettingsBtn" class="w-full text-left px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors">
        <i class="fa fa-cog mr-1"></i> 同步设置
      </button>
    </div>
  </div>
</div>
```

## 5. JavaScript 功能集成

### 5.1 初始化同步管理器

```javascript
// 初始化GitHub同步功能
initGithubSync() {
  this.syncConfigManager = new SyncConfigManager();
  this.githubSyncManager = null;
  
  // 加载配置
  this.loadSyncConfig();
  
  // 绑定事件
  this.bindGithubSyncEvents();
  
  // 初始化状态指示器
  this.initSyncStatusIndicator();
  
  // 启动自动同步（如果已配置）
  this.startAutoSync();
}

// 加载同步配置
loadSyncConfig() {
  const config = this.syncConfigManager.getConfig();
  
  if (config.token && config.gistId) {
    // 初始化GitHub同步管理器
    this.githubSyncManager = new GitHubSyncManager(config.token, config.gistId);
    
    // 更新UI
    document.getElementById('githubToken').value = config.token;
    document.getElementById('gistId').value = config.gistId;
    document.getElementById('autoSync').checked = config.autoSync || false;
    
    if (config.autoSync) {
      document.getElementById('syncIntervalContainer').classList.remove('hidden');
      document.getElementById('syncInterval').value = config.syncInterval || 5;
    }
    
    // 更新状态
    this.updateSyncStatusIndicator('configured');
  }
}

// 绑定GitHub同步事件
bindGithubSyncEvents() {
  // 打开配置模态框
  document.getElementById('openGithubSyncModal')?.addEventListener('click', () => {
    this.showGithubSyncModal();
  });
  
  // 关闭配置模态框
  document.getElementById('closeGithubSyncModal')?.addEventListener('click', () => {
    this.hideGithubSyncModal();
  });
  
  // 切换Token可见性
  document.getElementById('toggleTokenVisibility')?.addEventListener('click', (e) => {
    const tokenInput = document.getElementById('githubToken');
    const icon = e.currentTarget.querySelector('i');
    
    if (tokenInput.type === 'password') {
      tokenInput.type = 'text';
      icon.className = 'fa fa-eye-slash';
    } else {
      tokenInput.type = 'password';
      icon.className = 'fa fa-eye';
    }
  });
  
  // 自动同步开关
  document.getElementById('autoSync')?.addEventListener('change', (e) => {
    document.getElementById('syncIntervalContainer').classList.toggle('hidden', !e.target.checked);
  });
  
  // 测试连接
  document.getElementById('testGithubConnection')?.addEventListener('click', async () => {
    await this.testGithubConnection();
  });
  
  // 保存配置
  document.getElementById('saveGithubConfig')?.addEventListener('click', async () => {
    await this.saveGithubConfig();
  });
  
  // 仅下载
  document.getElementById('downloadFromGithub')?.addEventListener('click', async () => {
    await this.downloadFromGithub();
  });
  
  // 仅上传
  document.getElementById('uploadToGithub')?.addEventListener('click', async () => {
    await this.uploadToGithub();
  });
  
  // 清除配置
  document.getElementById('clearGithubConfig')?.addEventListener('click', () => {
    this.clearGithubConfig();
  });
  
  // 显示帮助
  document.getElementById('showGithubSyncHelp')?.addEventListener('click', (e) => {
    e.preventDefault();
    this.showGithubSyncHelpModal();
  });
  
  // 关闭帮助模态框
  document.getElementById('closeGithubSyncHelpModal')?.addEventListener('click', () => {
    this.hideGithubSyncHelpModal();
  });
  
  // 状态指示器点击
  document.getElementById('syncStatusButton')?.addEventListener('click', (e) => {
    e.stopPropagation();
    this.toggleSyncStatusMenu();
  });
  
  // 立即同步按钮
  document.getElementById('syncNowBtn')?.addEventListener('click', async () => {
    await this.performSync();
    this.hideSyncStatusMenu();
  });
  
  // 打开同步设置
  document.getElementById('openSyncSettingsBtn')?.addEventListener('click', () => {
    this.showGithubSyncModal();
    this.hideSyncStatusMenu();
  });
  
  // 点击其他地方关闭菜单
  document.addEventListener('click', () => {
    this.hideSyncStatusMenu();
  });
}
```

### 5.2 核心同步功能

```javascript
// 测试GitHub连接
async testGithubConnection() {
  const token = document.getElementById('githubToken').value.trim();
  const gistId = document.getElementById('gistId').value.trim();
  
  if (!token || !gistId) {
    this.showNotification('请填写完整的配置信息', 'warning');
    return;
  }
  
  const statusDiv = document.getElementById('githubSyncStatus');
  statusDiv.innerHTML = '<div class="flex items-center justify-center py-2"><i class="fa fa-spinner fa-spin mr-2"></i> 测试连接中...</div>';
  statusDiv.classList.remove('hidden');
  
  try {
    const testManager = new GitHubSyncManager(token, gistId);
    const result = await testManager.validateCredentials();
    
    if (result.valid) {
      statusDiv.innerHTML = `
        <div class="flex items-center text-green-600">
          <i class="fa fa-check-circle mr-2"></i>
          <span>连接成功！GitHub同步已就绪</span>
        </div>
      `;
      this.showNotification('GitHub连接成功', 'success');
    } else {
      statusDiv.innerHTML = `
        <div class="flex items-center text-red-600">
          <i class="fa fa-times-circle mr-2"></i>
          <span>${result.message}</span>
        </div>
      `;
      this.showNotification(`连接失败: ${result.message}`, 'danger');
    }
  } catch (error) {
    statusDiv.innerHTML = `
      <div class="flex items-center text-red-600">
        <i class="fa fa-times-circle mr-2"></i>
        <span>连接错误: ${error.message}</span>
      </div>
    `;
    this.showNotification(`连接错误: ${error.message}`, 'danger');
  }
}

// 保存GitHub配置
async saveGithubConfig() {
  const token = document.getElementById('githubToken').value.trim();
  const gistId = document.getElementById('gistId').value.trim();
  const autoSync = document.getElementById('autoSync').checked;
  const syncInterval = parseInt(document.getElementById('syncInterval').value);
  
  if (!token || !gistId) {
    this.showNotification('请填写完整的配置信息', 'warning');
    return;
  }
  
  const statusDiv = document.getElementById('githubSyncStatus');
  statusDiv.innerHTML = '<div class="flex items-center justify-center py-2"><i class="fa fa-spinner fa-spin mr-2"></i> 保存配置中...</div>';
  statusDiv.classList.remove('hidden');
  
  try {
    // 先测试连接
    const testManager = new GitHubSyncManager(token, gistId);
    const result = await testManager.validateCredentials();
    
    if (!result.valid) {
      throw new Error(result.message);
    }
    
    // 保存配置
    const config = {
      token: token,
      gistId: gistId,
      autoSync: autoSync,
      syncInterval: syncInterval
    };
    
    this.syncConfigManager.saveConfig(config);
    
    // 重新初始化同步管理器
    this.githubSyncManager = new GitHubSyncManager(token, gistId);
    
    // 更新状态
    this.updateSyncStatusIndicator('configured');
    this.syncConfigManager.updateSyncStatus('configured');
    
    // 启动自动同步
    this.startAutoSync();
    
    statusDiv.innerHTML = `
      <div class="flex items-center text-green-600">
        <i class="fa fa-check-circle mr-2"></i>
        <span>配置保存成功！GitHub同步已启用</span>
      </div>
    `;
    
    this.showNotification('GitHub同步配置已保存', 'success');
    
    // 延迟关闭模态框
    setTimeout(() => {
      this.hideGithubSyncModal();
    }, 1500);
  } catch (error) {
    statusDiv.innerHTML = `
      <div class="flex items-center text-red-600">
        <i class="fa fa-times-circle mr-2"></i>
        <span>保存失败: ${error.message}</span>
      </div>
    `;
    this.showNotification(`保存失败: ${error.message}`, 'danger');
  }
}

// 执行同步
async performSync() {
  if (!this.githubSyncManager) {
    this.showNotification('请先配置GitHub同步', 'warning');
    return;
  }
  
  this.updateSyncStatusIndicator('syncing');
  this.syncConfigManager.updateSyncStatus('syncing');
  
  try {
    const result = await this.githubSyncManager.sync();
    
    if (result.success) {
      // 更新任务列表
      this.loadLocalTasks();
      this.renderTasks();
      
      // 更新状态
      this.updateSyncStatusIndicator('synced', result.lastSync);
      this.syncConfigManager.updateSyncStatus('synced');
      
      let message = `同步成功，共 ${result.syncedTasks} 个任务`;
      if (result.conflictResolved) {
        message += '（已解决数据冲突）';
      }
      
      this.showNotification(message, 'success');
    } else {
      this.updateSyncStatusIndicator('error');
      this.syncConfigManager.updateSyncStatus('error', result.message);
      this.showNotification(`同步失败: ${result.message}`, 'danger');
    }
  } catch (error) {
    this.updateSyncStatusIndicator('error');
    this.syncConfigManager.updateSyncStatus('error', error.message);
    this.showNotification(`同步错误: ${error.message}`, 'danger');
  }
}

// 仅下载数据
async downloadFromGithub() {
  if (!this.githubSyncManager) {
    this.showNotification('请先配置GitHub同步', 'warning');
    return;
  }
  
  const statusDiv = document.getElementById('githubSyncStatus');
  statusDiv.innerHTML = '<div class="flex items-center justify-center py-2"><i class="fa fa-spinner fa-spin mr-2"></i> 下载数据中...</div>';
  statusDiv.classList.remove('hidden');
  
  try {
    const result = await this.githubSyncManager.downloadOnly();
    
    if (result.success) {
      // 更新任务列表
      this.loadLocalTasks();
      this.renderTasks();
      
      statusDiv.innerHTML = `
        <div class="flex items-center text-green-600">
          <i class="fa fa-check-circle mr-2"></i>
          <span>下载成功，共 ${result.downloadedTasks} 个任务</span>
        </div>
      `;
      
      this.updateSyncStatusIndicator('synced', result.lastSync);
      this.syncConfigManager.updateSyncStatus('synced');
      
      this.showNotification(`数据下载成功，共 ${result.downloadedTasks} 个任务`, 'success');
    } else {
      statusDiv.innerHTML = `
        <div class="flex items-center text-red-600">
          <i class="fa fa-times-circle mr-2"></i>
          <span>下载失败: ${result.message}</span>
        </div>
      `;
      this.showNotification(`下载失败: ${result.message}`, 'danger');
    }
  } catch (error) {
    statusDiv.innerHTML = `
      <div class="flex items-center text-red-600">
        <i class="fa fa-times-circle mr-2"></i>
        <span>下载错误: ${error.message}</span>
      </div>
    `;
    this.showNotification(`下载错误: ${error.message}`, 'danger');
  }
}

// 仅上传数据
async uploadToGithub() {
  if (!this.githubSyncManager) {
    this.showNotification('请先配置GitHub同步', 'warning');
    return;
  }
  
  const statusDiv = document.getElementById('githubSyncStatus');
  statusDiv.innerHTML = '<div class="flex items-center justify-center py-2"><i class="fa fa-spinner fa-spin mr-2"></i> 上传数据中...</div>';
  statusDiv.classList.remove('hidden');
  
  try {
    const result = await this.githubSyncManager.uploadOnly();
    
    if (result.success) {
      statusDiv.innerHTML = `
        <div class="flex items-center text-green-600">
          <i class="fa fa-check-circle mr-2"></i>
          <span>上传成功，共 ${result.uploadedTasks} 个任务</span>
        </div>
      `;
      
      this.updateSyncStatusIndicator('synced', result.lastSync);
      this.syncConfigManager.updateSyncStatus('synced');
      
      this.showNotification(`数据上传成功，共 ${result.uploadedTasks} 个任务`, 'success');
    } else {
      statusDiv.innerHTML = `
        <div class="flex items-center text-red-600">
          <i class="fa fa-times-circle mr-2"></i>
          <span>上传失败: ${result.message}</span>
        </div>
      `;
      this.showNotification(`上传失败: ${result.message}`, 'danger');
    }
  } catch (error) {
    statusDiv.innerHTML = `
      <div class="flex items-center text-red-600">
        <i class="fa fa-times-circle mr-2"></i>
        <span>上传错误: ${error.message}</span>
      </div>
    `;
    this.showNotification(`上传错误: ${error.message}`, 'danger');
  }
}

// 清除GitHub配置
clearGithubConfig() {
  if (confirm('确定要清除GitHub同步配置吗？这将不会删除Gist中的数据。')) {
    this.syncConfigManager.clearConfig();
    this.githubSyncManager = null;
    
    // 重置UI
    document.getElementById('githubToken').value = '';
    document.getElementById('gistId').value = '';
    document.getElementById('autoSync').checked = false;
    document.getElementById('syncIntervalContainer').classList.add('hidden');
    document.getElementById('githubSyncStatus').classList.add('hidden');
    
    // 停止自动同步
    this.stopAutoSync();
    
    // 更新状态
    this.updateSyncStatusIndicator('not_configured');
    
    this.showNotification('GitHub同步配置已清除', 'info');
  }
}
```

### 5.3 自动同步管理

```javascript
// 启动自动同步
startAutoSync() {
  const config = this.syncConfigManager.getConfig();
  
  if (!config.autoSync || !this.githubSyncManager) {
    return;
  }
  
  // 清除现有的定时器
  this.stopAutoSync();
  
  const interval = (config.syncInterval || 5) * 60 * 1000;
  
  this.autoSyncInterval = setInterval(async () => {
    // 检查网络状态
    if (!navigator.onLine) {
      console.log('网络离线，跳过自动同步');
      return;
    }
    
    console.log('执行自动同步...');
    await this.performSync();
  }, interval);
  
  console.log(`自动同步已启动，间隔 ${config.syncInterval} 分钟`);
}

// 停止自动同步
stopAutoSync() {
  if (this.autoSyncInterval) {
    clearInterval(this.autoSyncInterval);
    this.autoSyncInterval = null;
    console.log('自动同步已停止');
  }
}

// 网络状态监听
setupNetworkListeners() {
  window.addEventListener('online', () => {
    console.log('网络已连接');
    
    // 网络恢复时执行同步
    if (this.githubSyncManager && this.syncConfigManager.getConfig().autoSync) {
      setTimeout(async () => {
        await this.performSync();
      }, 1000);
    }
  });
  
  window.addEventListener('offline', () => {
    console.log('网络已断开');
  });
}
```

### 5.4 状态指示器管理

```javascript
// 初始化同步状态指示器
initSyncStatusIndicator() {
  const indicator = document.getElementById('syncStatusIndicator');
  if (indicator) {
    indicator.classList.remove('hidden');
  }
  
  this.updateSyncStatusIndicator('not_configured');
}

// 更新同步状态指示器
updateSyncStatusIndicator(status, lastSyncTime = null) {
  const statusMap = {
    not_configured: {
      icon: 'bg-gray-400',
      text: '未配置',
      detail: '未配置'
    },
    configured: {
      icon: 'bg-blue-500',
      text: '已配置',
      detail: '已配置'
    },
    syncing: {
      icon: 'bg-yellow-500 animate-pulse',
      text: '同步中',
      detail: '正在同步'
    },
    synced: {
      icon: 'bg-green-500',
      text: '已同步',
      detail: '同步成功'
    },
    error: {
      icon: 'bg-red-500',
      text: '错误',
      detail: '同步失败'
    }
  };
  
  const config = this.syncConfigManager.getConfig();
  const statusInfo = statusMap[status] || statusMap.not_configured;
  
  // 更新图标和文本
  const icon = document.getElementById('syncStatusIcon');
  const text = document.getElementById('syncStatusText');
  const detail = document.getElementById('syncStatusDetail');
  const lastTime = document.getElementById('syncLastTime');
  const mode = document.getElementById('syncMode');
  const count = document.getElementById('syncTaskCount');
  
  if (icon) {
    icon.className = `w-2 h-2 rounded-full ${statusInfo.icon}`;
  }
  
  if (text) {
    text.textContent = statusInfo.text;
  }
  
  if (detail) {
    detail.textContent = statusInfo.detail;
  }
  
  if (lastTime) {
    if (lastSyncTime) {
      const time = new Date(lastSyncTime);
      lastTime.textContent = time.toLocaleString();
    } else if (config.lastSync) {
      const time = new Date(config.lastSync);
      lastTime.textContent = time.toLocaleString();
    } else {
      lastTime.textContent = '从未';
    }
  }
  
  if (mode) {
    mode.textContent = config.autoSync ? `自动 (${config.syncInterval}分钟)` : '手动';
  }
  
  if (count) {
    count.textContent = this.tasks.length;
  }
}

// 显示同步状态菜单
toggleSyncStatusMenu() {
  const menu = document.getElementById('syncStatusMenu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
}

// 隐藏同步状态菜单
hideSyncStatusMenu() {
  const menu = document.getElementById('syncStatusMenu');
  if (menu) {
    menu.classList.add('hidden');
  }
}
```

## 6. 用户使用指南

### 6.1 配置步骤

**第一步：准备GitHub账号和Token**

1. **注册GitHub账号**（如果没有）
   - 访问 [GitHub官网](https://github.com)
   - 完成注册流程

2. **创建Personal Access Token**
   - 登录GitHub → 点击头像 → Settings
   - 选择 Developer settings → Personal access tokens → Tokens (classic)
   - 点击 Generate new token → Generate new token (classic)
   - 填写描述，选择 Never 过期，只勾选 `gist` 权限
   - 点击 Generate token，**复制并保存Token**

3. **创建私有Gist**
   - 访问 [Gist页面](https://gist.github.com)
   - 填写文件名 `taskpool-data.json`
   - 粘贴初始JSON数据（见下文）
   - 选择 Create secret gist
   - 从URL复制Gist ID

**初始JSON数据：**
```json
{
  "tasks": [],
  "lastSync": "2024-01-01T00:00:00.000Z",
  "version": "1.0"
}
```

**第二步：配置TaskPool**

1. **打开同步设置**
   - 在TaskPool应用中，点击右下角的同步状态指示器
   - 点击"同步设置"按钮

2. **填写配置信息**
   - 在GitHub Token字段粘贴您的Token
   - 在Gist ID字段粘贴您的Gist ID
   - 可选：勾选"启用自动同步"并设置同步间隔

3. **测试连接**
   - 点击"测试连接"按钮
   - 确认连接成功后点击"保存配置"

4. **完成配置**
   - 配置保存成功后，同步状态指示器会显示"已配置"
   - 点击"立即同步"开始第一次同步

### 6.2 日常使用

**手动同步**
1. 点击右下角的同步状态指示器
2. 点击"立即同步"按钮
3. 等待同步完成，状态会显示"已同步"

**自动同步**
- 如果启用了自动同步，应用会按照设定的间隔自动同步
- 网络恢复时也会自动触发同步

**查看同步状态**
- 点击同步状态指示器查看详细状态
- 包括上次同步时间、任务数量等信息

**多设备使用**
1. 在其他设备上按照相同步骤配置GitHub同步
2. 配置完成后执行同步，数据会自动同步到新设备
3. 多设备间的更改会自动合并

### 6.3 高级操作

**仅下载数据**
- 在同步设置中点击"仅下载"按钮
- 此操作会用Gist中的数据覆盖本地数据
- 适用于从备份恢复数据的场景

**仅上传数据**
- 在同步设置中点击"仅上传"按钮
- 此操作会用本地数据覆盖Gist中的数据
- 适用于初始化远程数据的场景

**清除配置**
- 在同步设置中点击"清除"按钮
- 此操作会清除本地配置，但不会删除Gist中的数据
- 适用于在公共设备上使用后清除敏感信息

## 7. 故障排除

### 7.1 常见问题及解决方案

**问题1: Token无效或已过期**

**症状**:
- 测试连接时提示"GitHub Token无效或已过期"
- 同步时出现401错误

**解决方案**:
1. 重新生成GitHub Personal Access Token
2. 确保只勾选了`gist`权限
3. 在TaskPool中更新Token配置
4. 重新测试连接并保存配置

**问题2: Gist不存在或无访问权限**

**症状**:
- 测试连接时提示"Gist不存在或无访问权限"
- 同步时出现404错误

**解决方案**:
1. 检查Gist ID是否正确
2. 确认Gist是私有的（secret）
3. 确认使用的Token有访问该Gist的权限
4. 尝试重新创建Gist并更新配置

**问题3: 网络连接问题**

**症状**:
- 同步时提示网络错误
- 状态显示"错误"

**解决方案**:
1. 检查网络连接是否正常
2. 确认可以访问GitHub网站
3. 等待网络恢复后重新同步
4. 如果使用代理，确保代理配置正确

**问题4: 数据冲突**

**症状**:
- 同步成功但提示"已解决数据冲突"
- 某些任务可能被覆盖

**解决方案**:
1. 检查冲突解决后的任务列表
2. 如果有重要数据丢失，可以使用"仅下载"或"仅上传"恢复
3. 尽量避免多设备同时编辑相同的任务

**问题5: 存储空间不足**

**症状**:
- 同步时提示存储空间不足
- 上传失败

**解决方案**:
1. GitHub Gist有大小限制（约10MB）
2. 清理不必要的任务数据
3. 考虑定期归档旧任务

### 7.2 高级诊断

**查看日志**
1. 打开浏览器开发者工具（F12或Ctrl+Shift+I）
2. 切换到Console标签页
3. 查看同步相关的日志信息

**手动检查Gist数据**
1. 直接访问您的Gist页面
2. 检查taskpool-data.json文件的内容
3. 确认数据格式正确且包含您的任务

**重置同步数据**
1. 在Gist页面直接编辑taskpool-data.json
2. 清空tasks数组或替换为备份数据
3. 在TaskPool中执行"仅下载"操作

**联系支持**
如果以上方法都无法解决问题，请准备以下信息寻求支持：
- GitHub用户名（可选）
- Gist ID（不要分享Token）
- 浏览器控制台的错误日志
- 问题的详细描述和复现步骤

## 8. 安全注意事项

### 8.1 安全最佳实践

**保护您的Token**
- 不要与他人分享您的GitHub Token
- 在公共设备上使用后及时清除配置
- 定期更新Token以提高安全性

**数据隐私**
- 虽然Gist是私有的，但仍建议不要在任务中存储敏感信息
- 考虑使用加密工具保护敏感数据后再同步

**定期备份**
- 定期使用"导出数据"功能备份任务
- 考虑定期导出Gist数据作为额外备份

### 8.2 风险提示

**使用风险**
- GitHub服务中断可能影响同步功能
- Token泄露可能导致数据被他人访问
- 免费GitHub账号有使用限制

**缓解措施**
- 启用双因素认证保护GitHub账号
- 使用强密码保护您的GitHub账号
- 定期检查授权的应用和Token
- 保持本地备份以防止数据丢失

---

通过遵循本详细指南，您可以成功配置和使用GitHub Gist同步功能，实现TaskPool任务数据在多设备间的无缝同步。如果您在使用过程中遇到任何问题，请参考故障排除部分或寻求技术支持。
// GitHub同步功能集成脚本
// 这个文件需要在index.html中引入，放在主应用脚本之前

// GitHub同步管理器类
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
    getLocalData(tasks) {
        try {
            const lastSync = localStorage.getItem('taskpool_last_sync');
            
            return {
                tasks: tasks || [],
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
    
    // 执行完整同步
    async sync(tasks) {
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
            const localData = this.getLocalData(tasks);
            
            // 步骤3: 解决冲突
            console.log('步骤3: 解决冲突');
            const resolvedData = this.resolveConflict(localData, remoteData);
            
            // 步骤4: 上传解决后的数据
            console.log('步骤4: 上传数据到Gist');
            await this.uploadLocalData(resolvedData);
            
            console.log('同步完成');
            
            return { 
                success: true, 
                message: '同步成功',
                tasks: resolvedData.tasks,
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
            
            console.log('数据下载完成');
            
            return {
                success: true,
                message: '数据下载成功',
                tasks: remoteData.tasks,
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
    async uploadOnly(tasks) {
        try {
            console.log('开始上传数据...');
            
            const localData = this.getLocalData(tasks);
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

// 同步配置管理类
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
}

// GitHub同步HTML模板
const GITHUB_SYNC_HTML = `
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
          <li>在TaskPool中点击右下角的同步状态指示器</li>
          <li>点击"同步设置"按钮</li>
          <li>粘贴GitHub Token和Gist ID</li>
          <li>点击"测试连接"验证配置</li>
          <li>点击"保存配置"</li>
          <li>开启自动同步（可选）</li>
        </ol>
      </div>
    </div>
  </div>
</div>

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
`;

// 将GitHub同步HTML添加到页面
function addGithubSyncHTML() {
    const body = document.querySelector('body');
    const div = document.createElement('div');
    div.innerHTML = GITHUB_SYNC_HTML;
    body.appendChild(div);
}

// 页面加载完成后添加HTML
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addGithubSyncHTML);
} else {
    addGithubSyncHTML();
}
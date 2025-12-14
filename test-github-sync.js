// GitHub同步功能测试脚本
// 在浏览器控制台中运行此脚本以测试GitHub同步功能

async function testGitHubSync() {
    console.log('=== GitHub同步功能测试 ===');
    
    try {
        // 1. 检查配置是否存在
        if (typeof GITHUB_CONFIG === 'undefined') {
            console.error('❌ 未找到GITHUB_CONFIG配置');
            return;
        }
        
        if (!GITHUB_CONFIG.GITHUB_TOKEN || !GITHUB_CONFIG.GIST_ID) {
            console.error('❌ GitHub Token或Gist ID配置不完整');
            return;
        }
        
        console.log('✅ GitHub配置已找到');
        console.log('- Token:', GITHUB_CONFIG.GITHUB_TOKEN.substring(0, 10) + '...');
        console.log('- Gist ID:', GITHUB_CONFIG.GIST_ID);
        
        // 2. 创建GitHubSyncManager实例
        const syncManager = new GitHubSyncManager(GITHUB_CONFIG.GITHUB_TOKEN, GITHUB_CONFIG.GIST_ID);
        console.log('✅ GitHubSyncManager实例创建成功');
        
        // 3. 验证凭证
        console.log('\n🔄 正在验证GitHub凭证...');
        const validationResult = await syncManager.validateCredentials();
        
        if (validationResult.valid) {
            console.log('✅ 凭证验证成功:', validationResult.message);
            
            // 4. 测试获取远程数据
            console.log('\n🔄 正在测试获取远程数据...');
            const remoteData = await syncManager.fetchRemoteData();
            if (remoteData) {
                console.log('✅ 成功获取远程数据');
                console.log('- 任务数量:', remoteData.tasks.length);
                console.log('- 最后同步时间:', remoteData.lastSync);
                console.log('- 版本:', remoteData.version);
            }
            
            // 5. 测试创建数据文件（如果不存在）
            console.log('\n🔄 正在测试创建数据文件...');
            await syncManager.createDataFile();
            console.log('✅ 数据文件创建成功');
            
            // 6. 测试上传数据
            console.log('\n🔄 正在测试上传数据...');
            const testData = {
                tasks: [
                    {
                        id: 'test-1',
                        title: '测试任务1',
                        priority: 'medium',
                        dueDate: null,
                        completed: false,
                        level: 1,
                        parentId: null,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    }
                ]
            };
            const uploadResult = await syncManager.uploadLocalData(testData);
            if (uploadResult) {
                console.log('✅ 数据上传成功');
            }
            
            // 7. 测试完整同步
            console.log('\n🔄 正在测试完整同步...');
            const syncResult = await syncManager.sync(testData.tasks);
            if (syncResult.success) {
                console.log('✅ 完整同步成功');
                console.log('- 同步任务数:', syncResult.syncedTasks);
                console.log('- 最后同步时间:', syncResult.lastSync);
                console.log('- 冲突解决:', syncResult.conflictResolved ? '是' : '否');
            } else {
                console.error('❌ 完整同步失败:', syncResult.message);
            }
            
        } else {
            console.error('❌ 凭证验证失败:', validationResult.message);
        }
        
    } catch (error) {
        console.error('❌ 测试过程中出错:', error);
        console.error('错误详情:', error.stack);
    }
}

// 运行测试
if (typeof window !== 'undefined') {
    // 在浏览器环境中运行
    window.testGitHubSync = testGitHubSync;
    console.log('GitHub同步测试脚本已加载，请运行 testGitHubSync() 开始测试');
} else {
    // 在Node.js环境中运行
    console.log('此脚本需要在浏览器环境中运行');
}
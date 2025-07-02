import { clearProjectDetailsCache, getProjectDetailsCacheStats } from './getProjectDetails';
import { cacheMonitor } from './cacheMonitor';

// Utility functions for cache management via browser console
export const cacheUtils = {
  // Get detailed cache statistics
  stats: () => {
    const stats = cacheMonitor.getStats();
    console.table(stats);
    return stats;
  },

  // Clear all cached data
  clear: () => {
    clearProjectDetailsCache();
    console.log('🧹 Cache cleared successfully');
    return 'Cache cleared';
  },

  // Reset cache monitor (clears cache and resets statistics)
  reset: () => {
    cacheMonitor.reset();
    console.log('🔄 Cache and statistics reset');
    return 'Cache and stats reset';
  },

  // Get cache contents (for debugging)
  contents: () => {
    const stats = getProjectDetailsCacheStats();
    console.log('📦 Cache Contents:');
    console.log(`   Size: ${stats.size} entries`);
    console.log(`   Keys: ${stats.keys.join(', ')}`);
    return stats;
  },

  // Performance report
  report: () => {
    cacheMonitor.logPerformanceReport();
    return 'Report logged to console';
  },

  // Help command
  help: () => {
    console.log('🛠️  Cache Management Commands:');
    console.log('   cacheUtils.stats()    - Show cache statistics');
    console.log('   cacheUtils.clear()    - Clear cached data');
    console.log('   cacheUtils.reset()    - Reset cache and stats');
    console.log('   cacheUtils.contents() - Show cache contents');
    console.log('   cacheUtils.report()   - Show performance report');
    console.log('   cacheUtils.help()     - Show this help');
    return 'Commands listed above';
  }
};

// Make it available globally in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  interface WindowWithCacheUtils extends Window {
    cacheUtils?: typeof cacheUtils;
  }
  (window as unknown as WindowWithCacheUtils).cacheUtils = cacheUtils;
  console.log('🔧 Cache utilities available at window.cacheUtils - Type cacheUtils.help() for commands');
} 
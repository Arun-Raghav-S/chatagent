import { getProjectDetailsCacheStats, clearProjectDetailsCache } from './getProjectDetails';

export class CacheMonitor {
  private static instance: CacheMonitor;
  private cacheHits = 0;
  private cacheMisses = 0;
  private startTime = Date.now();

  static getInstance(): CacheMonitor {
    if (!CacheMonitor.instance) {
      CacheMonitor.instance = new CacheMonitor();
    }
    return CacheMonitor.instance;
  }

  recordHit(): void {
    this.cacheHits++;
    console.log(`[CacheMonitor] 🎯 Cache HIT recorded. Total hits: ${this.cacheHits}`);
  }

  recordMiss(): void {
    this.cacheMisses++;
    console.log(`[CacheMonitor] ❌ Cache MISS recorded. Total misses: ${this.cacheMisses}`);
  }

  getStats() {
    const uptime = Date.now() - this.startTime;
    const totalRequests = this.cacheHits + this.cacheMisses;
    const hitRate = totalRequests > 0 ? (this.cacheHits / totalRequests * 100).toFixed(2) : '0.00';
    const cacheStats = getProjectDetailsCacheStats();

    return {
      uptime: Math.floor(uptime / 1000), // seconds
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      totalRequests,
      hitRate: `${hitRate}%`,
      cacheSize: cacheStats.size,
      cachedKeys: cacheStats.keys,
      performance: {
        avgLatencyReduction: this.cacheHits > 0 ? '~200-500ms per cached request' : 'N/A',
        estimatedSavedRequests: this.cacheHits
      }
    };
  }

  reset(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.startTime = Date.now();
    clearProjectDetailsCache();
    console.log('[CacheMonitor] 🔄 Cache monitor and cache cleared');
  }

  logPerformanceReport(): void {
    const stats = this.getStats();
    console.log('📊 [Cache Performance Report]');
    console.log(`   Uptime: ${stats.uptime}s`);
    console.log(`   Cache Hit Rate: ${stats.hitRate}`);
    console.log(`   Total Requests: ${stats.totalRequests} (${stats.cacheHits} hits, ${stats.cacheMisses} misses)`);
    console.log(`   Cache Size: ${stats.cacheSize} entries`);
    console.log(`   Estimated Latency Saved: ${stats.performance.avgLatencyReduction}`);
    console.log(`   API Calls Saved: ${stats.performance.estimatedSavedRequests}`);
  }
}

// Global cache monitor instance
export const cacheMonitor = CacheMonitor.getInstance();

// Auto-report every 5 minutes in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    cacheMonitor.logPerformanceReport();
  }, 5 * 60 * 1000); // 5 minutes
} 
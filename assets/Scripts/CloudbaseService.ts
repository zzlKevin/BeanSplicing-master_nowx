/**
 * CloudbaseService - 平台感知的数据库服务
 * 微信小游戏环境 → 使用 wx.cloud.database()
 * 原生/其他环境 → 使用 LocalStorageService (sys.localStorage)
 */

import { isWechat } from './PlatformUtils';
import { LocalStorageDBService, collection as localCollection, callFunction as localCallFunction } from './LocalStorageService';
import type { QueryCondition, SortRule, PageParams } from './LocalStorageService';

declare const wx: any;

// 微信云开发初始化（仅微信环境）
function initCloud(): void {
    if (typeof wx !== 'undefined' && wx?.cloud) {
        wx.cloud.init({ env: 'cloud1-2gltl8c72b1bc894', traceUser: true });
    }
}

// 在确认是微信环境时调用
if (isWechat()) {
    initCloud();
}

/**
 * 查询条件（兼容旧接口）
 */
export interface QueryConditionOld {
    where?: Record<string, any>;
    orderBy?: string;
    orderByDesc?: string;
    limit?: number;
    skip?: number;
}

/**
 * 数据库服务（单例）
 * 根据运行平台自动选择底层实现
 */
export class CloudbaseDBService {
    private static _instance: CloudbaseDBService = null;
    public static getInstance(): CloudbaseDBService {
        if (!CloudbaseDBService._instance) {
            CloudbaseDBService._instance = new CloudbaseDBService();
        }
        return CloudbaseDBService._instance;
    }

    private get isLocal(): boolean {
        return !isWechat();
    }

    private getDB() {
        if (this.isLocal) return null;
        try {
            return wx.cloud.database();
        } catch (e) {
            console.error('[CloudbaseService] Failed to get wx.cloud.database():', e);
            return null;
        }
    }

    private getLocalDB(collectionName: string): LocalStorageDBService {
        return localCollection(collectionName);
    }

    private convertOldConditions(conditions?: QueryConditionOld): QueryCondition[] | undefined {
        if (!conditions?.where) return undefined;
        return Object.entries(conditions.where).map(([field, value]) => ({
            field,
            op: '==' as const,
            value
        }));
    }

    private convertOldSort(conditions?: QueryConditionOld): SortRule | undefined {
        if (conditions?.orderBy) {
            return { field: conditions.orderBy, order: 'asc' };
        }
        if (conditions?.orderByDesc) {
            return { field: conditions.orderByDesc, order: 'desc' };
        }
        return undefined;
    }

    private convertOldPage(conditions?: QueryConditionOld): PageParams | undefined {
        if (!conditions?.limit) return undefined;
        return { limit: conditions.limit, offset: conditions.skip };
    }

    async query<T = any>(collectionName: string, conditions?: QueryConditionOld): Promise<T[]> {
        if (this.isLocal) {
            const db = this.getLocalDB(collectionName);
            const queryConds = this.convertOldConditions(conditions);
            const sort = this.convertOldSort(conditions);
            const page = this.convertOldPage(conditions);
            return await db.query<T>(queryConds, sort, page);
        }

        const db = this.getDB();
        if (!db) return [];

        try {
            let ref = db.collection(collectionName);
            if (conditions?.where) {
                ref = ref.where(conditions.where);
            }
            if (conditions?.orderBy) {
                ref = ref.orderBy(conditions.orderBy, 'asc');
            }
            if (conditions?.orderByDesc) {
                ref = ref.orderBy(conditions.orderByDesc, 'desc');
            }
            if (conditions?.skip) {
                ref = ref.skip(conditions.skip);
            }
            if (conditions?.limit) {
                ref = ref.limit(conditions.limit);
            }
            const res = await ref.get();
            return (res.data || []) as T[];
        } catch (e) {
            console.error(`[CloudbaseService] query("${collectionName}") failed:`, e);
            return [];
        }
    }

    async getById<T = any>(collectionName: string, id: string): Promise<T | null> {
        if (this.isLocal) {
            const db = this.getLocalDB(collectionName);
            return await db.getById<T>(id);
        }

        const db = this.getDB();
        if (!db) return null;

        try {
            const res = await db.collection(collectionName).doc(id).get();
            return res.data as T || null;
        } catch (e) {
            console.error(`[CloudbaseService] getById("${collectionName}", "${id}") failed:`, e);
            return null;
        }
    }

    async add(collectionName: string, data: Record<string, any>): Promise<string | null> {
        if (this.isLocal) {
            const db = this.getLocalDB(collectionName);
            return await db.add(data);
        }

        const db = this.getDB();
        if (!db) return null;

        try {
            const res = await db.collection(collectionName).add({ data });
            return res._id || null;
        } catch (e) {
            console.error(`[CloudbaseService] add("${collectionName}") failed:`, e);
            return null;
        }
    }

    async update(collectionName: string, id: string, data: Record<string, any>): Promise<boolean> {
        if (this.isLocal) {
            const db = this.getLocalDB(collectionName);
            return await db.update(id, data);
        }

        const db = this.getDB();
        if (!db) return false;

        try {
            await db.collection(collectionName).doc(id).update({ data });
            return true;
        } catch (e) {
            console.error(`[CloudbaseService] update("${collectionName}", "${id}") failed:`, e);
            return false;
        }
    }

    async delete(collectionName: string, id: string): Promise<boolean> {
        if (this.isLocal) {
            const db = this.getLocalDB(collectionName);
            return await db.delete(id);
        }

        const db = this.getDB();
        if (!db) return false;

        try {
            await db.collection(collectionName).doc(id).remove();
            return true;
        } catch (e) {
            console.error(`[CloudbaseService] delete("${collectionName}", "${id}") failed:`, e);
            return false;
        }
    }

    async upsert(
        collectionName: string,
        whereFields: Record<string, any>,
        data: Record<string, any>
    ): Promise<string | null> {
        if (this.isLocal) {
            const db = this.getLocalDB(collectionName);
            return await db.upsert(whereFields, data);
        }

        const db = this.getDB();
        if (!db) return null;

        try {
            const existing = await db.collection(collectionName).where(whereFields).get();
            if (existing.data && existing.data.length > 0) {
                const docId = existing.data[0]._id;
                await db.collection(collectionName).doc(docId).update({ data });
                return docId;
            }
            const res = await db.collection(collectionName).add({ data: { ...whereFields, ...data } });
            return res._id || null;
        } catch (e) {
            console.error(`[CloudbaseService] upsert("${collectionName}") failed:`, e);
            return null;
        }
    }

    async queryByPage<T = any>(
        collectionName: string,
        conditions: QueryConditionOld,
        sortField: string,
        sortOrder: 'asc' | 'desc' = 'desc',
        pageSize: number = 20,
        pageNum: number = 1
    ): Promise<{ data: T[]; total: number }> {
        if (this.isLocal) {
            const db = this.getLocalDB(collectionName);
            const queryConds = this.convertOldConditions(conditions);
            const sort: SortRule = { field: sortField, order: sortOrder };
            const page: PageParams = { limit: pageSize, offset: (pageNum - 1) * pageSize };
            return await db.queryByPage<T>(queryConds, sort, page);
        }

        const db = this.getDB();
        if (!db) return { data: [], total: 0 };

        try {
            const countRes = await db.collection(collectionName).where(conditions.where || {}).count();
            const total = countRes.total || 0;

            let ref = db.collection(collectionName);
            if (conditions.where) {
                ref = ref.where(conditions.where);
            }
            ref = ref.orderBy(sortField, sortOrder);
            ref = ref.skip((pageNum - 1) * pageSize);
            ref = ref.limit(pageSize);

            const res = await ref.get();
            return { data: (res.data || []) as T[], total };
        } catch (e) {
            console.error(`[CloudbaseService] queryByPage("${collectionName}") failed:`, e);
            return { data: [], total: 0 };
        }
    }

    async batchAdd(collectionName: string, dataArray: Record<string, any>[]): Promise<string[]> {
        if (this.isLocal) {
            const db = this.getLocalDB(collectionName);
            const docs = await db.batchAdd(dataArray);
            return docs.map(doc => doc._id);
        }

        const db = this.getDB();
        if (!db) return [];

        try {
            const promises = dataArray.map(data => this.add(collectionName, data));
            return Promise.all(promises).then(ids => {
                return ids.filter(id => id !== null) as string[];
            });
        } catch (e) {
            console.error(`[CloudbaseService] batchAdd("${collectionName}") failed:`, e);
            return [];
        }
    }
}

export default CloudbaseDBService.getInstance();

/**
 * 调用云函数（平台感知）
 */
export function callFunction(name: string, data: Record<string, any> = {}): Promise<any> {
    if (isWechat()) {
        if (typeof wx === 'undefined' || !wx.cloud) {
            console.warn('wx.cloud not available');
            return Promise.resolve({ result: { success: false, error: 'wx.cloud not available' } });
        }

        return wx.cloud.callFunction({
            name: name,
            data: data
        }).then(res => {
            console.log(`Cloud function "${name}" returned successfully`);
            return res;
        }).catch(error => {
            console.error(`Cloud function "${name}" failed:`, error);
            return { result: { success: false, error: error.message || error.errMsg } };
        });
    }

    console.warn(`[CloudbaseService] callFunction("${name}") is not available in local mode`);
    return Promise.resolve({ result: { success: false, error: 'not in wechat environment', localMode: true } });
}

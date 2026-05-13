/**
 * LocalStorageService - 本地存储数据库服务
 * 替代微信云开发 (wx.cloud.database) 的完整 CRUD 实现
 * 使用 Cocos Creator 的 sys.localStorage 进行数据持久化
 */
import { sys } from 'cc';

export interface QueryCondition {
    field: string;
    op: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'array-contains';
    value: any;
}

export interface SortRule {
    field: string;
    order: 'asc' | 'desc';
}

export interface PageParams {
    limit: number;
    offset?: number;
}

export interface DBDocument {
    _id: string;
    [key: string]: any;
}

const COLLECTION_PREFIX = 'db_';

function generateId(): string {
    return Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
}

function getCollectionKey(collection: string): string {
    return COLLECTION_PREFIX + collection;
}

function readCollection(collection: string): DBDocument[] {
    try {
        const raw = sys.localStorage.getItem(getCollectionKey(collection));
        if (!raw) return [];
        return JSON.parse(raw) as DBDocument[];
    } catch (e) {
        console.warn(`[LocalStorageService] Failed to read collection "${collection}":`, e);
        return [];
    }
}

function writeCollection(collection: string, docs: DBDocument[]): void {
    try {
        sys.localStorage.setItem(getCollectionKey(collection), JSON.stringify(docs));
    } catch (e) {
        console.error(`[LocalStorageService] Failed to write collection "${collection}":`, e);
    }
}

function matchesCondition(doc: DBDocument, cond: QueryCondition): boolean {
    const fieldValue = doc[cond.field];
    switch (cond.op) {
        case '==': return fieldValue === cond.value;
        case '!=': return fieldValue !== cond.value;
        case '>': return fieldValue > cond.value;
        case '>=': return fieldValue >= cond.value;
        case '<': return fieldValue < cond.value;
        case '<=': return fieldValue <= cond.value;
        case 'in': return Array.isArray(cond.value) && cond.value.includes(fieldValue);
        case 'array-contains':
            return Array.isArray(fieldValue) && fieldValue.includes(cond.value);
        default: return true;
    }
}

export class LocalStorageDBService {
    private collectionName: string;

    constructor(collectionName: string) {
        this.collectionName = collectionName;
    }

    async query<T = DBDocument>(
        conditions?: QueryCondition[],
        sort?: SortRule,
        page?: PageParams
    ): Promise<T[]> {
        let docs = readCollection(this.collectionName);

        if (conditions && conditions.length > 0) {
            docs = docs.filter(doc => conditions.every(cond => matchesCondition(doc, cond)));
        }

        if (sort) {
            const dir = sort.order === 'asc' ? 1 : -1;
            docs.sort((a, b) => {
                const va = a[sort.field];
                const vb = b[sort.field];
                if (va == null && vb == null) return 0;
                if (va == null) return 1;
                if (vb == null) return -1;
                if (va < vb) return -1 * dir;
                if (va > vb) return 1 * dir;
                return 0;
            });
        }

        if (page) {
            const offset = page.offset || 0;
            docs = docs.slice(offset, offset + page.limit);
        }

        return docs as T[];
    }

    async getById<T = DBDocument>(id: string): Promise<T | null> {
        const docs = readCollection(this.collectionName);
        const doc = docs.find(d => d._id === id);
        return doc ? (doc as T) : null;
    }

    async add(data: Record<string, any>): Promise<string> {
        const docs = readCollection(this.collectionName);
        const newDoc: DBDocument = { _id: generateId(), ...data };
        docs.push(newDoc);
        writeCollection(this.collectionName, docs);
        return newDoc._id;
    }

    async update(id: string, data: Record<string, any>): Promise<boolean> {
        const docs = readCollection(this.collectionName);
        const index = docs.findIndex(d => d._id === id);
        if (index === -1) return false;
        docs[index] = { ...docs[index], ...data, _id: id };
        writeCollection(this.collectionName, docs);
        return true;
    }

    async delete(id: string): Promise<boolean> {
        const docs = readCollection(this.collectionName);
        const filtered = docs.filter(d => d._id !== id);
        if (filtered.length === docs.length) return false;
        writeCollection(this.collectionName, filtered);
        return true;
    }

    async upsert(
        whereFields: Record<string, any>,
        data: Record<string, any>
    ): Promise<string> {
        const docs = readCollection(this.collectionName);
        const index = docs.findIndex(doc =>
            Object.entries(whereFields).every(([k, v]) => doc[k] === v)
        );

        if (index >= 0) {
            docs[index] = { ...docs[index], ...data, _id: docs[index]._id };
            writeCollection(this.collectionName, docs);
            return docs[index]._id;
        }

        const newDoc: DBDocument = { _id: generateId(), ...whereFields, ...data };
        docs.push(newDoc);
        writeCollection(this.collectionName, docs);
        return newDoc._id;
    }

    async queryByPage<T = DBDocument>(
        conditions: QueryCondition[],
        sort: SortRule,
        page: PageParams
    ): Promise<{ data: T[]; total: number }> {
        let docs = readCollection(this.collectionName);

        if (conditions && conditions.length > 0) {
            docs = docs.filter(doc => conditions.every(cond => matchesCondition(doc, cond)));
        }

        const total = docs.length;

        if (sort) {
            const dir = sort.order === 'asc' ? 1 : -1;
            docs.sort((a, b) => {
                const va = a[sort.field];
                const vb = b[sort.field];
                if (va == null && vb == null) return 0;
                if (va == null) return 1;
                if (vb == null) return -1;
                if (va < vb) return -1 * dir;
                if (va > vb) return 1 * dir;
                return 0;
            });
        }

        if (page) {
            const offset = page.offset || 0;
            docs = docs.slice(offset, offset + page.limit);
        }

        return { data: docs as T[], total };
    }

    async batchAdd(dataList: Record<string, any>[]): Promise<DBDocument[]> {
        const docs = readCollection(this.collectionName);
        const newDocs: DBDocument[] = dataList.map(data => ({ _id: generateId(), ...data }));
        docs.push(...newDocs);
        writeCollection(this.collectionName, docs);
        return newDocs;
    }

    async count(conditions?: QueryCondition[]): Promise<number> {
        let docs = readCollection(this.collectionName);
        if (conditions && conditions.length > 0) {
            docs = docs.filter(doc => conditions.every(cond => matchesCondition(doc, cond)));
        }
        return docs.length;
    }

    async getAll(): Promise<DBDocument[]> {
        return readCollection(this.collectionName);
    }
}

export function collection(name: string): LocalStorageDBService {
    return new LocalStorageDBService(name);
}

export async function callFunction(
    name: string,
    data?: Record<string, any>
): Promise<Record<string, any> | null> {
    console.warn(`[LocalStorageService] callFunction("${name}") is not available in local mode.`, data);
    return null;
}

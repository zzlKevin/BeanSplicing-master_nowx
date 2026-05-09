import { _decorator, Component, Node } from 'cc';
import { GameManager, DifficultyMode } from './GameManager';
import { callFunction } from './CloudbaseService';
import { ShopRuntimeData } from './ShopConfig';
import { UserInfo } from './UserInfo';
import type { RoadPassRewardClaimState } from './RoadController';
import { AudioManager } from './AudioManager';
import { sys } from 'cc';
import { isWechat } from './PlatformUtils';
const { ccclass, property} = _decorator;

// 微信小游戏全局对象类型声明
declare const wx: any;

type SubscribeMessageStatus = 'accept' | 'reject' | 'ban' | 'filter' | '';
type SubscribeTemplateAuthorizeState = 'unset' | 'accept' | 'reject';
export type UserInfoAuthorizeState = 'accept' | 'reject' | 'unset';

interface RequestSubscribeMessageResult {
    success: boolean;
    result: Record<string, SubscribeMessageStatus>;
    error?: string;
}

interface SubscribeMessageSettingResult {
    success: boolean;
    mainSwitch: boolean | null;
    itemSettings: Record<string, SubscribeMessageStatus>;
    error?: string;
}

interface CreateSubscribeTaskOptions {
    templateId: string;
    payload: Record<string, any>;
    sendAt: number;
    page?: string;
    scene?: string;
    miniprogramState?: 'developer' | 'trial' | 'formal';
    dedupeKey?: string;
}

interface SubscribeTaskClientResult {
    success: boolean;
    subscribeStatus?: SubscribeMessageStatus;
    subscribeResult?: Record<string, SubscribeMessageStatus>;
    taskResult?: any;
    duplicated?: boolean;
    taskId?: string;
    error?: string;
}

/**
 * 云存储管理器
 * 接入微信小游戏 wx.setUserCloudStorage 接口
 */
@ccclass('WXManager')
export class WXManager extends Component {
    private static readonly USER_NICKNAME_STORAGE_KEY = 'user_nickname';
    private static readonly USER_AVATAR_URL_STORAGE_KEY = 'user_avatar_url';
    private static readonly USER_AUTHORIZED_AVATAR_URL_STORAGE_KEY = 'user_authorized_avatar_url';
    private static readonly USER_CURRENT_AVATAR_SOURCE_STORAGE_KEY = 'user_current_avatar_source';
    private static readonly GAME_EVALUATION_RECOMMENDED_STORAGE_KEY = 'game_evaluation_recommended';
    private static readonly USER_SEX_STORAGE_KEY = 'user_sex';
    private static readonly USER_AVATAR_FRAME_ID_STORAGE_KEY = 'user_avatar_frame_id';
    private static readonly USER_TWEEZER_ID_STORAGE_KEY = 'user_tweezer_id';
    private static readonly USER_IRON_ID_STORAGE_KEY = 'user_iron_id';
    private static readonly USER_OWNED_AVATAR_IDS_STORAGE_KEY = 'user_owned_avatar_ids';
    private static readonly USER_OWNED_AVATAR_FRAME_IDS_STORAGE_KEY = 'user_owned_avatar_frame_ids';
    private static readonly USER_OWNED_TWEEZER_IDS_STORAGE_KEY = 'user_owned_tweezer_ids';
    private static readonly USER_OWNED_IRON_IDS_STORAGE_KEY = 'user_owned_iron_ids';
    private static readonly USER_OWNED_ACHIEVEMENT_ICON_IDS_STORAGE_KEY = 'user_owned_achievement_icon_ids';
    private static readonly BOOK_UNLOCKED_IDS_STORAGE_PREFIX = 'book_unlocked_ids';
    private static readonly BOOK_PROGRESS_REWARD_STORAGE_PREFIX = 'book_progress_reward';
    private static readonly ROAD_PASS_FREE_CLAIMED_LEVELS_STORAGE_KEY = 'road_pass_free_claimed_levels';
    private static readonly ROAD_PASS_PREMIUM_CLAIMED_LEVELS_STORAGE_KEY = 'road_pass_premium_claimed_levels';
    private static readonly ROAD_PASS_PREMIUM_UNLOCKED_STORAGE_KEY = 'road_pass_premium_unlocked';
    private static readonly ROAD_PASS_VIDEO_WATCH_COUNT_STORAGE_KEY = 'road_pass_video_watch_count';

    @property({ type: Node })
    testBtn: Node = null;

    subscribeTemplateId: string = 'dhpYKr-YayyWv_ibni2T5EOkwEjBQsk1QDPS1huZCvQ';
    subscribePage: string = '';
    subscribeTipField: string = 'thing2';
    subscribeCurrentPowerField: string = 'thing7';
    private subscribeTemplateAuthorizeStateCache: SubscribeTemplateAuthorizeState = 'unset';

    // 激励视频广告实例
    private rewardedVideoAd: any = null;
    private interstitialAd: any = null;
    private readonly INTERSTITIAL_MIN_INTERVAL: number = 5 * 60 * 1000;
    private readonly INTERSTITIAL_LAST_SHOW_STORAGE_KEY: string = 'interstitial_last_show_at';
    private _gameEvaluationRecommended: boolean = false;
    // 激励视频广告位 id（在微信公众平台广告位配置获取）
    private readonly VIDEO_AD_UNIT_ID: string = 'adunit-f7349bec4122701f';
    private readonly INTERSTITIAL_AD_UNIT_ID: string = 'adunit-613709c057d35ead';
    // 是否为调试模式（正式版但广告位为 test123 时启用）
    private isDebugMode: boolean = true//false;

    // 分享图片 ID（在微信公众平台「增长入口」→「小程序分享图」上传获取）
    private _imageUrlId: string = 'qGwwwryFRtmUgxcDjf2p3w==';
    // 分享图片 URL（必须 HTTPS）
    private _imageUrl: string = 'https://mmocgame.qpic.cn/wechatgame/f4uuDhnRAxMTJF1dLAUnqlLAKiaIMZfsk7uHGIUribuCc8ibicOmTxAVDvvG6LMQLTMb/0';

    onLoad() {
        this.restoreCachedUserProfile();
        this._gameEvaluationRecommended = this.getGameEvaluationRecommendedFromStorage();
        this.showShareMenu();
        // imageUrlId、imageUrl：在微信公众平台「增长入口」→「小程序分享图」上传后获得的图片 ID 和图片 URL
        this.onShareAppMessage('快来和我一起拼豆！');
        // if (!this.isDebugMode) {
            // this.createRewardedVideoAd();
            // this.createInterstitialAd();
        // }
    }

    // ========== 激励视频广告 ==========
    private getUserInfoModel(): UserInfo | null {
        return GameManager.getInstance()?.userInfo ?? null;
    }

    private ensureUserProfileLoadedFromCache(): UserInfo | null {
        const userInfo = this.getUserInfoModel();
        if (!userInfo || !isWechat()) {
            return userInfo;
        }

        if (userInfo.nickname || userInfo.avatarUrl) {
            return userInfo;
        }

        const nickname = String(sys.localStorage.getItem(WXManager.USER_NICKNAME_STORAGE_KEY) || '').trim();
        const avatarUrl = String(sys.localStorage.getItem(WXManager.USER_AVATAR_URL_STORAGE_KEY) || '').trim();
        if (UserInfo.isRealUserProfile(nickname, avatarUrl)) {
            userInfo.setProfile(nickname, avatarUrl);
        }

        return userInfo;
    }

    private skillRewardedVideoClosed: ((success: boolean) => void) | null = null;

    /**
     * 创建激励视频广告
     */
    private createRewardedVideoAd(): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        if (!isWechat()) {
            // 非微信环境不创建广告
            return;
        }
        if (typeof wx.createRewardedVideoAd !== 'function') return;
        try {
            this.rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: this.REWARDED_VIDEO_AD_UNIT_ID });

            this.rewardedVideoAd.onLoad(() => {
                console.log('激励视频广告加载完成');
            });

            this.rewardedVideoAd.onError((err: any) => {
                console.warn('激励视频广告错误:', err);
            });

            this.rewardedVideoAd.onClose((res: any) => {
                if (res && res.isEnded) {
                    console.log('激励视频广告播放完成，发放奖励');
                    this.skillRewardedVideoClosed?.(true);
                } else {
                    console.log('激励视频广告未看完，不发放奖励');
                    this.skillRewardedVideoClosed?.(false);
                }
                this.skillRewardedVideoClosed = null;
                this.scheduleOnce(() => {
                    AudioManager.instance.resumeBgm();
                }, 0.5);
            });
        } catch (e) {
            console.warn('创建激励视频广告失败:', e);
        }
    }

    /**
     * 显示激励视频广告
     * @param callback 播放结束后的回调，参数表示是否完整看完
     */
    public showRewardedVideoAd(callback: (success: boolean) => void): void {
        if (!isWechat()) {
            callback?.(true);
            return;
        }

        if (this.isDebugMode) {
            callback?.(true);
            return;
        }

        if (!this.rewardedVideoAd) {
            console.warn('激励视频广告未创建');
            callback?.(false);
            return;
        }

        AudioManager.instance.pauseBgm();
        this.skillRewardedVideoClosed = callback;

        this.rewardedVideoAd.show().then(() => {
            console.log('激励视频广告显示成功');
        }).catch((err: any) => {
            this.rewardedVideoAd.load().then(() => {
                return this.rewardedVideoAd.show();
            }).catch(() => {
                this.skillRewardedVideoClosed?.(false);
                this.skillRewardedVideoClosed = null;
            });
        });
    }

    // ========== 游戏圈 ==========
    private gameClubOpenLink: string = '-SSEykJvFV3pORt5kTNpS_6DPrRDfozxCy2jEFL07zx4R-MPpU1tST5hbtFc_HIAj2wCkd5SAVv3YF0b64mCaSig10g5_N-0VSt13L2-6XHYTPxYuYHrwKWDWcpLZH54HOsgGoyYRB8BRKGj2OmqcX0cBZgDOBWwBNIHZuH3cxSpsLFkmn6DZ4vYzCND_U8NGLS3k-FzDYC6WmFvxUXNRonP7Vw17RgTuj0vJWDeXQJOZUkmujqMLLjnh1ZICLPLhOX0zLLntMnnS8U2jrhN74hPjDwO1ibU1ilk6z6Q37J1P2K_USQMxVSmEQ071HbS5w_PKiVKTmNb2zkBGKRMoA';
    private gameClubOpenLink_Recommend: string = 'FM09ILkjlQxM0OIigsWiuGIdFe7FV0HoNKXS8V9PYREEYfFyUYW8l60mFmyI6DFMUFslSKzrqX1aQkxGqUPSPfOr65rBAZfQcI936dkW2d43YKa3xHDvgKRQtEpwy7cyfybIZpj7ZYRQ2JKuyfv_VSUXicFhZ4KZki3DfCNednhmOUd_HVgd2DKnPoc0r4gUDpc_qbnW25Ki5R4wyqbWRbX_TACzPcYGYD8opptw4SVlN-M2yWX7BxO-I4CFGsm0Qd2-lxh47Njg7FB1vzaFDOT4FRjTyIpLF7cSHbcYIfE2givsB-alDWE2gIf1iBXdWc0ZTrpSOm2TeA1G_hHE3-6B4VAmNc8VOrhFD3zcp3D5lMmSqO6NZreR30CRSJg_kKisDgvsvt_v1ssABrr46A';
    /**
     * 设置游戏圈 openLink（需在微信公众平台获取）
     * @param openLink 活动或功能的 openLink
     */
    public setGameClubOpenLink(openLink: string): void {
        this.gameClubOpenLink = openLink;
    }

    /**
     * 打开游戏圈
     */
    public openGameClub(): void {
        // 环境检查
        if (typeof wx === 'undefined' || typeof wx.createPageManager !== 'function') {
            console.warn('当前环境不支持 wx.createPageManager');
            return;
        }
        if (!this.gameClubOpenLink) {
            console.warn('游戏圈 openLink 未设置，请先调用 setGameClubOpenLink 设置');
            return;
        }
        // 恢复原有功能
        const pageManager = wx.createPageManager();
        pageManager.load({ openlink: this.gameClubOpenLink })
        .then((res: any) => {
            console.log('游戏圈加载成功:', res);
            pageManager.show();
        }).catch((err: any) => {
            console.warn('游戏圈加载失败:', err);
        });
    }

    // 推荐位 openLink
    private readonly RECOMMEND_OPENLINK: string = 'TWFRCqV5WeM2AkMXhKwJ03MhfPOieJfAsvXKUbWvQFQtLyyA5etMPabBehga950uzfZcH3Vi3QeEh41xRGEVFw';

    /**
     * 创建插屏广告
     */
    private createInterstitialAd(): void {
        // 补全环境检查：如果不在微信环境，直接返回
        if (!isWechat() || typeof wx === 'undefined') {
            return;
        }
        if (typeof wx.createInterstitialAd !== 'function') return;
        try {
            // 恢复原有的广告创建逻辑
            this.interstitialAd = wx.createInterstitialAd({ adUnitId: this.INTERSTITIAL_AD_UNIT_ID });
            this.interstitialAd.onLoad(() => {
                console.log('插屏广告加载完成');
            });
            this.interstitialAd.onError((err: any) => {
                console.warn('插屏广告错误:', err);
            });
            this.interstitialAd.onClose(() => {
                console.log('插屏广告已关闭');
            });
        } catch (e) {
            console.warn('创建插屏广告失败:', e);
        }
    }

    /**
     * 显示插屏广告
     */
    public async showInterstitialAd(): Promise<boolean> {
        if (!isWechat()) return false;
        if (this.isDebugMode) return false;
        if (!this.interstitialAd) {
            console.warn('插屏广告未创建');
            return false;
        }

        const now = Date.now();
        const lastShowAt = Number(sys.localStorage.getItem(this.INTERSTITIAL_LAST_SHOW_STORAGE_KEY)) || 0;
        if (lastShowAt > 0 && now - lastShowAt < this.INTERSTITIAL_MIN_INTERVAL) {
            console.log('[Interstitial] skip show due to cooldown', {
                now,
                lastShowAt,
                remainingMs: this.INTERSTITIAL_MIN_INTERVAL - (now - lastShowAt)
            });
            return false;
        }

        try {
            await this.interstitialAd.show();
            sys.localStorage.setItem(this.INTERSTITIAL_LAST_SHOW_STORAGE_KEY, String(now));
            return true;
        } catch {
            try {
                await this.interstitialAd.load();
                await this.interstitialAd.show();
                sys.localStorage.setItem(this.INTERSTITIAL_LAST_SHOW_STORAGE_KEY, String(now));
                return true;
            } catch (err: any) {
                console.warn('插屏广告显示失败:', err);
                return false;
            }
        }
    }

    public hasRecommendedGameEvaluation(): boolean {
        return this._gameEvaluationRecommended;
    }

    private getGameEvaluationRecommendedFromStorage(): boolean {
        if (!isWechat()) {
            return false;
        }

        return !!sys.localStorage.getItem(WXManager.GAME_EVALUATION_RECOMMENDED_STORAGE_KEY);
    }

    public setGameEvaluationRecommended(value: boolean): void {
        this._gameEvaluationRecommended = !!value;
        if (!isWechat()) {
            return;
        }

        if (this._gameEvaluationRecommended) {
            sys.localStorage.setItem(WXManager.GAME_EVALUATION_RECOMMENDED_STORAGE_KEY, String(1));
            return;
        }

        sys.localStorage.removeItem(WXManager.GAME_EVALUATION_RECOMMENDED_STORAGE_KEY);
    }

    public tryShowGameEvaluation(): void {
        if (this._gameEvaluationRecommended) {
            return;
        }

        if (!isWechat()) {
            return;
        }

        try {
            const pageManager = null;

            pageManager.on('destroy', (result) => {
                if (result?.isRecommended) {
                    this.setGameEvaluationRecommended(true);
                }
            });

            pageManager.load({
                openlink: this.RECOMMEND_OPENLINK
            }).then(() => {
                try {
                    pageManager.show();
                } catch (error) {
                    console.warn('调用推荐位页面失败:', error);
                }
            }).catch((error: any) => {
                console.warn('推荐位页面加载失败:', error);
            });
        } catch (error) {
            console.warn('创建推荐位页面失败:', error);
        }
    }

    /**
     * 显示分享菜单
     * @param withShareTicket 是否使用 shareTicket，默认为 false
     * @param menus 分享功能菜单，默认为 ['shareAppMessage', 'shareTimeline']
     */
    public showShareMenu(
        withShareTicket: boolean = false,
        menus: string[] = ['shareAppMessage', 'shareTimeline']
    ): void {
        if (!isWechat()) return;

        try {
            wx.showShareMenu?.({
                withShareTicket,
                menus,
                success: () => console.log('分享菜单已显示'),
                fail: (err: any) => console.warn('显示分享菜单失败:', err)
            });
        } catch (e) {
            console.warn('显示分享菜单失败:', e);
        }
    }

    /**
     * 隐藏分享菜单
     */
    public hideShareMenu(): void {
        if (!isWechat()) return;

        try {
            wx.hideShareMenu?.({
                success: () => console.log('分享菜单已隐藏'),
                fail: (err: any) => console.warn('隐藏分享菜单失败:', err)
            });
        } catch (e) {
            console.warn('隐藏分享菜单失败:', e);
        }
    }

    /**
     * 自定义分享内容
     * @param title 分享标题，默认使用小程序名称
     */
    public onShareAppMessage(title?: string): void {
        if (isWechat()) {
            wx.onShareAppMessage(() => ({
                title: title ?? '',
                imageUrlId: this._imageUrlId,
                imageUrl: this._imageUrl,
            }));
        } else {
            console.log('[LocalMode] onShareAppMessage skipped');
        }
    }

    /**
     * 设置分享图片（需在 onLoad 之前或在编辑器面板中配置）
     * @param imageUrlId 素材图片 ID
     * @param imageUrl 分享图片 URL
     */
    public setShareImage(imageUrlId: string, imageUrl: string): void {
        this._imageUrlId = imageUrlId;
        this._imageUrl = imageUrl;
    }

    /**
     * 主动分享（调用后显示分享面板，用户选择好友/群后完成分享）
     * @param title 分享标题
     * @param query 分享链接后的参数，格式 'key1=value1&key2=value2'
     * @param withShareTicket 是否使用 shareTicket，默认 false
     */
    public shareAppMessage(
        title: string,
        withShareTicket: boolean = false
    ): Promise<void> {
        if (!isWechat()) return Promise.resolve();
        return new Promise((resolve, reject) => {
            if (!isWechat()) {
                reject(new Error('不在微信小游戏环境中'));
                return;
            }

            wx.shareAppMessage({
                title: title,
                imageUrl: this._imageUrl,
                imageUrlId: this._imageUrlId,
                withShareTicket,
                success: () => {
                    console.log('主动分享成功');
                    resolve();
                },
                fail: (err: any) => {
                    console.warn('主动分享失败:', err);
                    reject(err);
                }
            });
        });
    }

    /**
     * 设置截屏/录屏时隐藏画面
     */
    public setCaptureRestricted(): void {
        if (!isWechat()) return;

        try {
            // wx.setVisualEffectOnCapture?.({
            //     visualEffect: 'hidden',
            //     success: () => console.log('截屏限制已开启'),
            //     fail: (err: any) => console.warn('设置截屏限制失败:', err)
            // });
        } catch (e) {
            console.warn('设置截屏限制失败:', e);
        }
    }

    /**
     * 恢复截屏/录屏正常显示
     */
    public setCaptureNone(): void {
        // [LocalMode] Using sys.localStorage instead of wx storage

        if (!isWechat()) return;
        try {
            wx.setVisualEffectOnCapture?.({
                visualEffect: 'none',
                success: () => console.log('截屏限制已恢复'),
                fail: (err: any) => console.warn('恢复截屏限制失败:', err)
            });
        } catch (e) {
            console.warn('恢复截屏限制失败:', e);
        }
    }

    start() {
        if (this.testBtn) {
            this.testBtn.on(Node.EventType.TOUCH_END, this.onTestBtnClick, this);
        }
    }

    private onTestBtnClick(): void {
        if (GameManager.getInstance()?.isWindowBlocking()) return;
        this.clearStorageLevel();
    }

    public async getStorageLevel(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('level');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setStorageLevel(level){
        // [LocalMode] Using sys.localStorage instead of wx storage

        sys.localStorage.setItem('level', String(level));
    }

    /**
     * 清除所有难度的关卡缓存
     */
    public clearStorageLevel(): void {
        // [LocalMode] Using sys.localStorage instead of wx storage

        sys.localStorage.removeItem('level_simple');
        sys.localStorage.removeItem('level_medium');
        sys.localStorage.removeItem('level_hard');
        sys.localStorage.removeItem(this.getBookUnlockedIdsStorageKey(DifficultyMode.SIMPLE));
        sys.localStorage.removeItem(this.getBookUnlockedIdsStorageKey(DifficultyMode.MEDIUM));
        sys.localStorage.removeItem(this.getBookUnlockedIdsStorageKey(DifficultyMode.HARD));
        sys.localStorage.removeItem(this.getBookProgressRewardStorageKey(DifficultyMode.SIMPLE));
        sys.localStorage.removeItem(this.getBookProgressRewardStorageKey(DifficultyMode.MEDIUM));
        sys.localStorage.removeItem(this.getBookProgressRewardStorageKey(DifficultyMode.HARD));
        console.log('已清除所有难度关卡缓存');
    }

    /**
     * 按难度保存关卡数
     */
    public setStorageLevelByDifficulty(difficulty: DifficultyMode, level: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(`level_${difficulty}`, String(level));
    }

    /**
     * 按难度获取关卡数
     */
    public getStorageLevelByDifficulty(difficulty: DifficultyMode): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem(`level_${difficulty}`);
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setBookUnlockedIdsByDifficulty(difficulty: DifficultyMode, ids: number[]): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(this.getBookUnlockedIdsStorageKey(difficulty), String(this.normalizeOwnedIds(ids)));
    }

    public getBookUnlockedIdsByDifficulty(difficulty: DifficultyMode): Promise<number[] | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return this.getOwnedIdsFromStorage(this.getBookUnlockedIdsStorageKey(difficulty));
    }

    public addBookUnlockedIdsByDifficulty(difficulty: DifficultyMode, ids: number[]): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        const key = this.getBookUnlockedIdsStorageKey(difficulty);
        const currentIds = this.normalizeOwnedIds(sys.localStorage.getItem(key));
        sys.localStorage.setItem(key, String(this.normalizeOwnedIds([...currentIds, ...ids])));
    }

    public setBookProgressRewardStatesByDifficulty(
        difficulty: DifficultyMode,
        states: { progress: number; claimed: boolean }[]
    ): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(this.getBookProgressRewardStorageKey(difficulty), String(this.normalizeBookProgressRewardStates(states)));
    }

    public getBookProgressRewardStatesByDifficulty(
        difficulty: DifficultyMode
    ): Promise<{ progress: number; claimed: boolean }[] | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            const val = sys.localStorage.getItem(this.getBookProgressRewardStorageKey(difficulty));
            if (val !== null && val !== undefined && val !== '') {
                try {
                    resolve(this.normalizeBookProgressRewardStates(JSON.parse(val)));
                } catch (e) {
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
    }
    public getBookProgressRewardClaimedProgressesByDifficulty(difficulty: DifficultyMode): Promise<number[] | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return this.getBookProgressRewardStatesByDifficulty(difficulty).then((states) => {
            if (!states) {
                return null;
            }

            return states
                .filter((state) => state.claimed)
                .map((state) => state.progress);
        });
    }

    public setBookProgressRewardClaimedByDifficulty(
        difficulty: DifficultyMode,
        progress: number,
        claimed: boolean = true
    ): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        const key = this.getBookProgressRewardStorageKey(difficulty);
        const states = this.normalizeBookProgressRewardStates(sys.localStorage.getItem(key));
        const safeProgress = Math.max(0, Math.floor(Number(progress) || 0));
        if (safeProgress <= 0) {
            return;
        }

        const index = states.findIndex((state) => state.progress === safeProgress);
        if (index >= 0) {
            states[index].claimed = claimed;
        } else {
            states.push({ progress: safeProgress, claimed });
        }
        sys.localStorage.setItem(key, String(this.normalizeBookProgressRewardStates(states)));
    }

    /**
     * 短振动
     * @param type 振动强度类型：'heavy'（重）、'medium'（中）、'light'（轻），默认 'medium'
     */
    public vibrateShort(
        type: 'heavy' | 'medium' | 'light' = 'medium'
    ): void {
        if (!isWechat()) return;
        // [LocalMode] Using sys.localStorage instead of wx storage

        if (typeof wx.vibrateShort !== 'function') {
            console.warn('wx.vibrateShort 不可用');
            return;
        }

        wx.vibrateShort({
            type,
            success: () => {
                console.log('短振动成功');
            },
            fail: (err: any) => {
                console.warn('短振动失败:', err);
            }
        });
    }

    public setShake(isShake: boolean){
        // [LocalMode] Using sys.localStorage instead of wx storage

        sys.localStorage.setItem('shake', String(isShake == true ? 1 : 0));
    }

    public getShake(): Promise<number | null>{
        // [LocalMode] Using sys.localStorage instead of wx storage

        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('shake');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    /**
     * 设置左右手设置
     * @param handSetting -1:左手  1:右手
     */
    public setHandSetting(handSetting: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage

        sys.localStorage.setItem('hand_setting', String(handSetting));
    }

    /**
     * 获取左右手设置
     * @returns -1:左手  1:右手  null:未设置
     */
    public getHandSetting(): Promise<number | null> {
        if (!isWechat()) {
            console.warn('不在微信小游戏环境中');
            return Promise.resolve(null);
        }

        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('hand_setting');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public static get instance(): WXManager | null {
        const gameManager = GameManager.getInstance();
        return gameManager?.wxManager ?? null;
    }

    /**
     * 设置音乐开关
     */
    public setMusic(isOn: boolean): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem('music', String(isOn ? 1 : 0));
    }

    /**
     * 获取音乐开关
     */
    public getMusic(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('music');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    /**
     * 设置音效开关
     */
    public setAudio(isOn: boolean): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem('audio', String(isOn ? 1 : 0));
    }

    /**
     * 获取音效开关
     */
    public getAudio(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('audio');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    /**
     * 将像素数据保存到系统相册
     * @param width 纹理宽度
     * @param height 纹理高度
     * @param byteArray 像素数据（RGBA）
     */
    public saveImageToPhotosAlbum(
        width: number,
        height: number,
        byteArray: Uint8Array,
        background?: any
    ): void {
        // [LocalMode] Using sys.localStorage instead of wx storage

        // 创建离屏 canvas
        const canvas = document.createElement('canvas');
        const outputWidth = Math.max(1, Math.floor(background?.outputWidth ?? width));
        const outputHeight = Math.max(1, Math.floor(background?.outputHeight ?? height));
        canvas.width = outputWidth;
        canvas.height = outputHeight;

        const ctx = canvas.getContext('2d') as any;
        if (!ctx) {
            console.warn('获取 canvas 2d context 失败');
            return;
        }

        const drawResultLayer = () => {
            const layerCanvas = document.createElement('canvas');
            layerCanvas.width = width;
            layerCanvas.height = height;
            const layerCtx = layerCanvas.getContext('2d') as any;
            if (!layerCtx) {
                console.warn('获取截图图层 canvas 2d context 失败');
                return;
            }

            const imageData = layerCtx.createImageData(width, height);
            imageData.data.set(byteArray);
            layerCtx.putImageData(imageData, 0, 0);
            const layerX = Math.floor(background?.layerX ?? 0);
            const layerY = Math.floor(background?.layerY ?? 0);
            const layerWidth = Math.max(1, Math.floor(background?.layerWidth ?? width));
            const layerHeight = Math.max(1, Math.floor(background?.layerHeight ?? height));
            ctx.drawImage(layerCanvas, 0, 0, width, height, layerX, layerY, layerWidth, layerHeight);
            this.exportCanvasToPhotosAlbum(canvas, outputWidth, outputHeight);
        };

        const backgroundSources = this.getCanvasImageSources(background);
        if (backgroundSources.length > 0) {
            this.drawBackgroundFromSources(canvas, ctx, backgroundSources, outputWidth, outputHeight, drawResultLayer);
            return;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outputWidth, outputHeight);
        drawResultLayer();
    }

    private getCanvasImageSources(background: any): any[] {
        const sources: any[] = [];
        const addSource = (source: any) => {
            if (!source || source === '[object Object]') {
                return;
            }
            if (typeof source === 'string' && source.trim().length <= 0) {
                return;
            }
            if (sources.indexOf(source) < 0) {
                sources.push(source);
            }
        };

        const imageAsset = background?.imageAsset ?? null;

        addSource(imageAsset?.data);
        addSource(imageAsset?.nativeUrl);
        addSource(imageAsset?._nativeUrl);
        addSource(background?.resourcePath);

        return sources;
    }

    private drawBackgroundFromSources(
        canvas: any,
        ctx: any,
        sources: any[],
        width: number,
        height: number,
        onComplete: () => void
    ): void {
        let index = 0;
        const tryNext = () => {
            const source = sources[index++];
            if (!source) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                onComplete();
                return;
            }

            if (typeof source !== 'string') {
                try {
                    ctx.drawImage(source, 0, 0, width, height);
                    onComplete();
                } catch (err) {
                    console.warn('绘制截图背景失败:', err);
                    tryNext();
                }
                return;
            }

            const image = canvas.createImage?.() ?? new Image();
            image.onload = () => {
                ctx.drawImage(image, 0, 0, width, height);
                onComplete();
            };
            image.onerror = (err: any) => {
                console.warn('加载截图背景失败:', source, err);
                tryNext();
            };
            image.src = source;
        };

        tryNext();
    }

    private exportCanvasToPhotosAlbum(canvas: any, width: number, height: number): void {

        // 将 canvas 导出为临时文件路径
        if (!isWechat()) return;
        canvas.toTempFilePath({
            x: 0,
            y: 0,
            width,
            height,
            destWidth: width,
            destHeight: height,
            fileType: 'png',
            quality: 1,
            success: (res: any) => {
                console.log('临时图片路径:', res.tempFilePath);
                // 保存到系统相册
                wx.saveImageToPhotosAlbum({
                    filePath: res.tempFilePath,
                    success: () => {
                        console.log('图片已保存到相册');
                    },
                    fail: (err: any) => {
                        console.warn('保存到相册失败:', err);
                        // 用户可能未授权，提示授权
                        if (err.errMsg && err.errMsg.includes('auth deny')) {
                            Promise.resolve({ confirm: true, cancel: false });
                        }
                    }
                });
            },
            fail: (err: any) => {
                console.warn('导出临时图片失败:', err);
            }
        });
    }

    /**
     * 设置能量
     */
    public setPower(power: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem('power', String(power));
    }

    /**
     * 获取能量
     */
    public getPower(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('power');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    /**
     * 保存金币数量到本地缓存
     */
    public setCoins(coins: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem('coins', String(coins));
    }

    /**
     * 获取本地缓存的金币数量
     */
    public getCoins(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('coins');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    /**
     * 保存经验值到本地缓存
     */
    public setExperience(experience: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem('experience', String(Math.max(0, Math.floor(Number(experience)) || 0)));
    }

    /**
     * 获取本地缓存的经验值
     */
    public getExperience(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('experience');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setFixSkillCount(count: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem('fix_skill_count', String(count));
    }

    public getFixSkillCount(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('fix_skill_count');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setTimeSkillCount(count: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem('time_skill_count', String(count));
    }

    public getTimeSkillCount(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('time_skill_count');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setPaletteSkillCount(count: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem('palette_skill_count', String(count));
    }

    public setRoadPassRewardClaimState(state: RoadPassRewardClaimState): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(
            WXManager.ROAD_PASS_FREE_CLAIMED_LEVELS_STORAGE_KEY, String(this.normalizeClaimedLevels(state?.freeClaimedLevels))
        );
        sys.localStorage.setItem(
            WXManager.ROAD_PASS_PREMIUM_CLAIMED_LEVELS_STORAGE_KEY, String(this.normalizeClaimedLevels(state?.premiumClaimedLevels))
        );
    }

    
    // 2. 在 getRoadPassRewardClaimState 中正常调用
    public async getRoadPassRewardClaimState(): Promise<RoadPassRewardClaimState | null> {
        const [freeClaimedLevels, premiumClaimedLevels] = await Promise.all([
            this.getClaimedLevelsFromStorage(WXManager.ROAD_PASS_FREE_CLAIMED_LEVELS_STORAGE_KEY),
            this.getClaimedLevelsFromStorage(WXManager.ROAD_PASS_PREMIUM_CLAIMED_LEVELS_STORAGE_KEY)
        ]);

        if (!freeClaimedLevels && !premiumClaimedLevels) {
            return null;
        }

        return {
            freeClaimedLevels: freeClaimedLevels ?? [],
            premiumClaimedLevels: premiumClaimedLevels ?? []
        };
    }

    public setRoadPassFreeRewardClaimed(level: number, claimed: boolean = true): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        this.setClaimedLevel(WXManager.ROAD_PASS_FREE_CLAIMED_LEVELS_STORAGE_KEY, level, claimed);
    }

    public setRoadPassPremiumRewardClaimed(level: number, claimed: boolean = true): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        this.setClaimedLevel(WXManager.ROAD_PASS_PREMIUM_CLAIMED_LEVELS_STORAGE_KEY, level, claimed);
    }

    public setRoadPassPremiumUnlocked(unlocked: boolean): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(WXManager.ROAD_PASS_PREMIUM_UNLOCKED_STORAGE_KEY, String(unlocked ? 1 : 0));
    }

    public getRoadPassPremiumUnlocked(): Promise<boolean | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem(WXManager.ROAD_PASS_PREMIUM_UNLOCKED_STORAGE_KEY);
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setRoadPassVideoWatchCount(count: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(
            WXManager.ROAD_PASS_VIDEO_WATCH_COUNT_STORAGE_KEY, String(Math.max(0, Math.floor(Number(count)) || 0))
        );
    }

    public getRoadPassVideoWatchCount(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem(WXManager.ROAD_PASS_VIDEO_WATCH_COUNT_STORAGE_KEY);
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public getUserSex(): string {
        if (!isWechat()) {
            return 'male';
        }

        const sex = String(sys.localStorage.getItem(WXManager.USER_SEX_STORAGE_KEY) || '').trim();
        return sex === 'female' ? 'female' : 'male';
    }

    public setUserSex(sex: string): void {
        if (!isWechat()) {
            return;
        }

        const normalizedSex = sex === 'female' ? 'female' : 'male';
        sys.localStorage.setItem(WXManager.USER_SEX_STORAGE_KEY, String(normalizedSex));
    }

    public setAuthorizedAvatarUrl(avatarUrl: string): void {
        // [LocalMode] Using sys.localStorage instead of wx storage

        const safeAvatarUrl = String(avatarUrl || '').trim();
        if (safeAvatarUrl) {
            sys.localStorage.setItem(WXManager.USER_AUTHORIZED_AVATAR_URL_STORAGE_KEY, String(safeAvatarUrl));
            return;
        }

        sys.localStorage.removeItem(WXManager.USER_AUTHORIZED_AVATAR_URL_STORAGE_KEY);
    }

    public getAuthorizedAvatarUrl(): Promise<string | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem(WXManager.USER_AUTHORIZED_AVATAR_URL_STORAGE_KEY);
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setCurrentAvatarSource(avatarSource: string): void {
        // [LocalMode] Using sys.localStorage instead of wx storage

        const safeAvatarSource = String(avatarSource || '').trim();
        if (safeAvatarSource) {
            sys.localStorage.setItem(WXManager.USER_CURRENT_AVATAR_SOURCE_STORAGE_KEY, String(safeAvatarSource));
            return;
        }

        sys.localStorage.removeItem(WXManager.USER_CURRENT_AVATAR_SOURCE_STORAGE_KEY);
    }

    public getCurrentAvatarSource(): Promise<string | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem(WXManager.USER_CURRENT_AVATAR_SOURCE_STORAGE_KEY);
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setAvatarFrameId(id: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(WXManager.USER_AVATAR_FRAME_ID_STORAGE_KEY, String(Math.max(0, Math.floor(Number(id)) || 0)));
    }

    public getAvatarFrameId(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem(WXManager.USER_AVATAR_FRAME_ID_STORAGE_KEY);
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setTweezerId(id: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(WXManager.USER_TWEEZER_ID_STORAGE_KEY, String(Math.max(0, Math.floor(Number(id)) || 0)));
    }

    public getTweezerId(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem(WXManager.USER_TWEEZER_ID_STORAGE_KEY);
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setIronId(id: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(WXManager.USER_IRON_ID_STORAGE_KEY, String(Math.max(0, Math.floor(Number(id)) || 0)));
    }

    public getIronId(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem(WXManager.USER_IRON_ID_STORAGE_KEY);
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setOwnedAvatarIds(ids: number[]): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(WXManager.USER_OWNED_AVATAR_IDS_STORAGE_KEY, String(this.normalizeOwnedIds(ids)));
    }

    public getOwnedAvatarIds(): Promise<number[] | null> {
        return this.getOwnedIdsFromStorage(WXManager.USER_OWNED_AVATAR_IDS_STORAGE_KEY);
    }

    public setOwnedAvatarFrameIds(ids: number[]): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(WXManager.USER_OWNED_AVATAR_FRAME_IDS_STORAGE_KEY, String(this.normalizeOwnedIds(ids)));
    }

    public getOwnedAvatarFrameIds(): Promise<number[] | null> {
        return this.getOwnedIdsFromStorage(WXManager.USER_OWNED_AVATAR_FRAME_IDS_STORAGE_KEY);
    }

    public setOwnedTweezerIds(ids: number[]): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(WXManager.USER_OWNED_TWEEZER_IDS_STORAGE_KEY, String(this.normalizeOwnedIds(ids)));
    }

    public getOwnedTweezerIds(): Promise<number[] | null> {
        return this.getOwnedIdsFromStorage(WXManager.USER_OWNED_TWEEZER_IDS_STORAGE_KEY);
    }

    public setOwnedIronIds(ids: number[]): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(WXManager.USER_OWNED_IRON_IDS_STORAGE_KEY, String(this.normalizeOwnedIds(ids)));
    }

    public getOwnedIronIds(): Promise<number[] | null> {
        return this.getOwnedIdsFromStorage(WXManager.USER_OWNED_IRON_IDS_STORAGE_KEY);
    }

    public setOwnedAchievementIconIds(ids: number[]): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem(WXManager.USER_OWNED_ACHIEVEMENT_ICON_IDS_STORAGE_KEY, String(this.normalizeOwnedIds(ids)));
    }

    public getOwnedAchievementIconIds(): Promise<number[] | null> {
        return this.getOwnedIdsFromStorage(WXManager.USER_OWNED_ACHIEVEMENT_ICON_IDS_STORAGE_KEY);
    }

    public getPaletteSkillCount(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('palette_skill_count');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    private getOwnedIdsFromStorage(key: string): Promise<number[] | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            const val = sys.localStorage.getItem(key);
            if (val !== null && val !== undefined && val !== '') {
                try {
                    const normalizedIds = this.normalizeOwnedIds(JSON.parse(val));
                    resolve(normalizedIds.length > 0 ? normalizedIds : null);
                } catch (e) {
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
    }

    private getClaimedLevelsFromStorage(key: string): Promise<number[] | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            const val = sys.localStorage.getItem(key);
            if (val !== null && val !== undefined && val !== '') {
                try {
                    const normalizedLevels = this.normalizeClaimedLevels(JSON.parse(val));
                    resolve(normalizedLevels.length > 0 ? normalizedLevels : null);
                } catch (e) {
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
    }

    private setClaimedLevel(key: string, level: number, claimed: boolean): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        const safeLevel = Math.max(0, Math.floor(Number(level) || 0));
        if (safeLevel <= 0) {
            return;
        }

        const levels = new Set(this.normalizeClaimedLevels(sys.localStorage.getItem(key)));
        if (claimed) {
            levels.add(safeLevel);
        } else {
            levels.delete(safeLevel);
        }

        sys.localStorage.setItem(key, String(this.normalizeClaimedLevels(Array.from(levels))));
    }

    private normalizeOwnedIds(ids: unknown): number[] {
        if (!Array.isArray(ids)) {
            return [];
        }

        const normalizedIds = Array.from(new Set(
            ids
                .map((id) => Math.max(1, Math.floor(Number(id) || 0)))
                .filter((id) => id >= 1)
        ));
        normalizedIds.sort((a, b) => a - b);
        return normalizedIds;
    }

    private normalizeClaimedLevels(levels: unknown): number[] {
        if (!Array.isArray(levels)) {
            return [];
        }

        const normalizedLevels = Array.from(new Set(
            levels
                .map((level) => Math.max(0, Math.floor(Number(level) || 0)))
                .filter((level) => level > 0)
        ));
        normalizedLevels.sort((a, b) => a - b);
        return normalizedLevels;
    }

    private normalizeBookProgressRewardStates(states: unknown): { progress: number; claimed: boolean }[] {
        if (!Array.isArray(states)) {
            return [];
        }

        const stateMap = new Map<number, boolean>();
        for (const state of states) {
            const progress = Math.max(0, Math.floor(Number((state as any)?.progress) || 0));
            if (progress <= 0) {
                continue;
            }

            stateMap.set(progress, !!(state as any)?.claimed);
        }

        return Array.from(stateMap.entries())
            .map(([progress, claimed]) => ({ progress, claimed }))
            .sort((a, b) => a.progress - b.progress);
    }

    private getBookUnlockedIdsStorageKey(difficulty: DifficultyMode): string {
        return `${WXManager.BOOK_UNLOCKED_IDS_STORAGE_PREFIX}_${difficulty}`;
    }

    private getBookProgressRewardStorageKey(difficulty: DifficultyMode): string {
        return `${WXManager.BOOK_PROGRESS_REWARD_STORAGE_PREFIX}_${difficulty}`;
    }

    public setShopData(shopData: ShopRuntimeData): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem('shop_data', String(shopData));
    }

    public getShopData(): Promise<ShopRuntimeData | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('shop_data');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public setShopRefreshTime(refreshTime: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem('shop_refresh_time', String(refreshTime));
    }

    public getShopRefreshTime(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('shop_refresh_time');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    /**
     * 设置体力下次恢复时间（时间戳，毫秒）
     */
    public setPowerNextRegenTime(time: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage
        sys.localStorage.setItem('power_next_regen', String(time));
    }

    /**
     * 获取体力下次恢复时间（时间戳，毫秒）
     */
    public getPowerNextRegenTime(): Promise<number | null> {
        // [LocalMode] Using sys.localStorage instead of wx storage
        return new Promise((resolve) => {
            new Promise((resolve) => {
            const val = sys.localStorage.getItem('power_next_regen');
            if (val !== null && val !== undefined && val !== '') {
                try { resolve(JSON.parse(val)); } catch { resolve(val); }
            } else {
                resolve(null);
            }
        });
        });
    }

    public getPowerNextRegenTimeSync(): number {
        if (!isWechat()) return 0;
        return Math.max(0, Number(sys.localStorage.getItem('power_next_regen')) || 0);
    }

    // ========== 原生模板广告 ==========
    private customAd: any = null;
    private nativeAdStyle = { left: 0, top: 0, width: 0 };
    private nativeAdVisibleRequested: boolean = false;
    // 原生模板广告位 id
    private readonly NATIVE_AD_UNIT_ID: string = 'adunit-e0eab827ac9fbb10';

    private applyNativeAdStyle(): void {
        if (!this.customAd?.style) return;
        this.customAd.style.left = this.nativeAdStyle.left;
        this.customAd.style.top = this.nativeAdStyle.top;
        this.customAd.style.width = this.nativeAdStyle.width;
        this.customAd.style.fixed = true;
    }

    private showNativeAdInternal(): void {
        if (!this.customAd) return;
        if (!this.nativeAdVisibleRequested) return;
        this.customAd.show().catch((err: any) => {
            console.warn('原生广告显示失败:', err);
        });
    }

    private getWindowSize(): { width: number; height: number } | null {
        if (!isWechat()) return null;
        const windowInfo = wx.getWindowInfo?.();
        const width = windowInfo?.windowWidth;
        const height = windowInfo?.windowHeight;
        if (!width || !height) return null;
        return { width, height };
    }

    /**
     * 创建原生模板广告
     * @param left 距离屏幕左侧像素（左上角为原点）
     * @param top 距离屏幕顶部像素（左上角为原点）
     * @param width 广告宽度
     */
    public createNativeAd(left: number, top: number, width: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage

        if (!isWechat()) return;
        this.nativeAdStyle.left = Math.max(0, Math.floor(left));
        this.nativeAdStyle.top = Math.max(0, Math.floor(top));
        this.nativeAdStyle.width = Math.max(1, Math.floor(width));

        try {
            if (!this.customAd) {
                this.customAd = wx.createCustomAd({
                    adUnitId: this.NATIVE_AD_UNIT_ID,
                    style: {
                        left: this.nativeAdStyle.left,
                        top: this.nativeAdStyle.top,
                        width: this.nativeAdStyle.width,
                        fixed: true
                    }
                });

                this.customAd.onLoad(() => {
                    console.log('原生广告加载成功', this.nativeAdStyle);
                    this.applyNativeAdStyle();
                    if (this.nativeAdVisibleRequested) {
                        this.showNativeAdInternal();
                    }
                });

                this.customAd.onError((err: any) => {
                    console.warn('原生广告加载失败:', err);
                });

                this.customAd.onClose(() => {
                    console.log('原生广告关闭');
                });
            }
        } catch (e) {
            console.warn('创建原生广告失败:', e);
        }
    }

    /**
     * 在屏幕底部创建原生模板广告
     * @param width 广告宽度，默认铺满窗口宽度
     * @param bottomMargin 距离底部的边距
     * @param estimatedHeight 预估广告高度，用于计算 top
     */
    public createNativeAdAtBottom(bottomMargin: number = 0, estimatedHeight: number = 120): void {
        const windowSize = this.getWindowSize();
        if (!windowSize) return;

        const adWidth = Math.max(1, windowSize.width);
        const left = 0;
        const top = Math.max(0, Math.floor(windowSize.height - estimatedHeight - bottomMargin));
        this.createNativeAd(left, top, adWidth);
    }

    /**
     * 隐藏原生广告
     */
    public hideNativeAd(): void {
        this.nativeAdVisibleRequested = false;
        if (!this.customAd) return;
        this.customAd.hide?.();
    }

    /**
     * 显示原生广告（如果未创建会自动创建并显示）
     * @param bottomMargin 距离底部的边距，默认 0
     * @param estimatedHeight 预估广告高度，默认 120
     */
    public showNativeAd(bottomMargin: number = 0, estimatedHeight: number = 120): void {
        this.nativeAdVisibleRequested = true;
        if (!this.customAd) {
            this.createNativeAdAtBottom(bottomMargin, estimatedHeight);
            return;
        }
        this.showNativeAdInternal();
    }

    /**
     * 销毁原生广告
     */
    public destroyNativeAd(): void {
        this.nativeAdVisibleRequested = false;
        if (this.customAd) {
            this.customAd.destroy();
            this.customAd = null;
        }
    }

    // ========== 原生格子广告 ==========
    private nativeGridAd: any = null;
    private nativeGridAdStyle = { left: 0, top: 0 };
    private nativeGridAdVisibleRequested: boolean = false;
    private readonly NATIVE_GRID_AD_UNIT_ID: string = 'adunit-4873c091df5fa489';

    private showNativeGridAdInternal(): void {
        if (!this.nativeGridAd) return;
        if (!this.nativeGridAdVisibleRequested) return;
        this.nativeGridAd.show().catch((err: any) => {
            console.warn('原生格子广告显示失败:', err);
        });
    }

    /**
     * 创建原生格子广告（贴近屏幕右边）
     * @param right 距离屏幕右侧像素（左上角为原点）
     * @param top 距离屏幕顶部像素（左上角为原点）
     */
    public createNativeGridAd(right: number, top: number): void {
        // [LocalMode] Using sys.localStorage instead of wx storage

        if (!isWechat()) return;
        const windowSize = this.getWindowSize();
        if (!windowSize) return;

        // 计算 left 位置使广告贴近屏幕右边
        const adWidth = 56; // 广告宽度
        const left = Math.max(0, Math.floor(windowSize.width - adWidth - right));

        this.nativeGridAdStyle.left = left;
        this.nativeGridAdStyle.top = Math.max(0, Math.floor(top));

        try {
            if (!this.nativeGridAd) {
                this.nativeGridAd = wx.createCustomAd({
                    adUnitId: this.NATIVE_GRID_AD_UNIT_ID,
                    style: {
                        left: this.nativeGridAdStyle.left,
                        top: this.nativeGridAdStyle.top,
                        width: adWidth,
                        fixed: true
                    }
                });

                this.nativeGridAd.onLoad(() => {
                    console.log('原生格子广告加载成功');
                    if (this.nativeGridAdVisibleRequested) {
                        this.showNativeGridAdInternal();
                    }
                });

                this.nativeGridAd.onError((err: any) => {
                    console.warn('原生格子广告加载失败:', err);
                });

                this.nativeGridAd.onClose(() => {
                    console.log('原生格子广告关闭');
                });
            }
        } catch (e) {
            console.warn('创建原生格子广告失败:', e);
        }
    }

    /**
     * 在指定位置创建原生格子广告
     * @param topPercent 距离屏幕顶部的百分比
     */
    public createNativeGridAdAtBottom(topPercent: number): void {
        const windowSize = this.getWindowSize();
        if (!windowSize) return;

        const top = Math.floor(windowSize.height * topPercent);
        this.createNativeGridAd(0, top);
    }

    /**
     * 销毁原生格子广告
     */
    public destroyNativeGridAd(): void {
        this.nativeGridAdVisibleRequested = false;
        if (this.nativeGridAd) {
            this.nativeGridAd.destroy();
            this.nativeGridAd = null;
        }
    }

    /**
     * 显示原生格子广告（如果未创建会自动创建并显示）
     * @param topPercent 距离屏幕顶部的百分比
     */
    public showNativeGridAd(topPercent: number): void {
        this.nativeGridAdVisibleRequested = true;
        if (!this.nativeGridAd) {
            this.createNativeGridAdAtBottom(topPercent);
            return;
        }
        this.showNativeGridAdInternal();
    }

    /**
     * 隐藏原生格子广告
     */
    public hideNativeGridAd(): void {
        this.nativeGridAdVisibleRequested = false;
        if (!this.nativeGridAd) return;
        this.nativeGridAd.hide?.();
    }

    // ========== 登录凭证 ==========

    /**
     * 调用微信登录接口，获取登录凭证（code）
     * 用于换取 openid、session_key 等用户标识
     * @see https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.login.html
     * @returns Promise<{ code: string | null; errMsg: string }>
     */
    public login(): Promise<{ code: string | null; errMsg: string }> {
        return new Promise((resolve) => {
            if (!isWechat()) {
                console.warn('不在微信小游戏环境中');
                resolve({ code: null, errMsg: 'not in wechat environment' });
                return;
            }

            // 微信环境：调用 wx.login
            wx.login({
                success: (res: any) => {
                    if (res.code) {
                        resolve({ code: res.code, errMsg: '' });
                    } else {
                        console.warn('wx.login 成功但未返回 code:', res);
                        resolve({ code: null, errMsg: 'no code returned' });
                    }
                },
                fail: (err: any) => {
                    console.error('wx.login 失败:', err);
                    resolve({ code: null, errMsg: err?.errMsg || 'login failed' });
                }
            });
        });
    }

    /**
     * 检查登录态是否过期
     * 通过 wx.checkSession 检查小程序登录态是否过期
     * @see https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.checkSession.html
     * @returns Promise<boolean> 是否有效
     */
    public checkSession(): Promise<boolean> {
        return new Promise((resolve) => {
            if (!isWechat()) {
                resolve(false);
                return;
            }

            wx.checkSession({
                success: () => {
                    console.log('session 有效');
                    resolve(true);
                },
                fail: () => {
                    console.log('session 已过期，需要重新登录');
                    resolve(false);
                }
            });
        });
    }

    // ========== 云函数调用 ==========

    /**
     * 获取用户 openid
     * 流程：wx.login -> 云函数 get_openid -> 保存到 storage
     * @returns Promise<string | null> openid
     */
    public async getOpenId(): Promise<string | null> {
        // ===== 本地模式：生成/读取本地 openid =====
        if (!isWechat()) {
            let localOpenId = sys.localStorage.getItem('local_openid');
            if (!localOpenId) {
                // 生成一个伪 openid，例如：local_随机串
                localOpenId = 'local_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
                sys.localStorage.setItem('local_openid', localOpenId);
                console.log('本地模式生成 openid:', localOpenId);
            }
            return localOpenId;
        }

        // ===== 微信环境：原有流程 =====
        // 先检查本地是否已有缓存
        const cachedOpenid = sys.localStorage.getItem('openid');
        if (cachedOpenid) {
            console.log('使用缓存的 openid:', cachedOpenid);
            return cachedOpenid;
        }

        // 获取登录凭证
        const loginResult = await this.login();
        if (!loginResult.code) {
            console.warn('获取登录凭证失败:', loginResult.errMsg);
            return null;
        }

        // 调用云函数获取 openid
        const res = await callFunction('get_openid', { js_code: loginResult.code });

        if (res.result?.success && res.result.openid) {
            // 保存到本地缓存
            sys.localStorage.setItem('openid', String(res.result.openid));
            console.log('获取 openid 成功:', res.result.openid);
            return res.result.openid;
        }

        console.warn('获取 openid 失败:', res.result?.error);
        return null;
    }

    // ========== 用户信息 ==========

    // 用户昵称缓存
    public get nickname(): string {
        return this.ensureUserProfileLoadedFromCache()?.nickname ?? '';
    }

    private get _nickname(): string {
        return this.nickname;
    }


    // 用户头像 URL 缓存
    public get avatarUrl(): string {
        return this.ensureUserProfileLoadedFromCache()?.avatarUrl ?? '';
    }

    private get _avatarUrl(): string {
        return this.avatarUrl;
    }

    public hasRealUserProfile(): boolean {
        return this.ensureUserProfileLoadedFromCache()?.hasRealUserProfile() ?? false;
    }

    private isFallbackNickname(nickname: string): boolean {
        return /^豆友([A-Za-z0-9]{4})?$/.test((nickname || '').trim());
    }

    private isRealUserProfile(nickname: string, avatarUrl: string): boolean {
        const safeNickname = (nickname || '').trim();
        const safeAvatarUrl = (avatarUrl || '').trim();
        return !!safeNickname && !this.isFallbackNickname(safeNickname) && !!safeAvatarUrl;
    }

    private restoreCachedUserProfile(): void {
        const userInfo = this.getUserInfoModel();
        if (!userInfo || !isWechat()) {
            return;
        }

        const nickname = String(sys.localStorage.getItem(WXManager.USER_NICKNAME_STORAGE_KEY) || '').trim();
        const avatarUrl = String(sys.localStorage.getItem(WXManager.USER_AVATAR_URL_STORAGE_KEY) || '').trim();

        if (UserInfo.isRealUserProfile(nickname, avatarUrl)) {
            userInfo.setProfile(nickname, avatarUrl);
            return;
        }

        userInfo.clearProfile();
    }

    private saveCachedUserProfile(): void {
        const userInfo = this.getUserInfoModel();
        if (!userInfo || !isWechat()) {
            return;
        }

        if (!userInfo.hasRealUserProfile()) {
            this.clearCachedUserProfile();
            return;
        }

        sys.localStorage.setItem(WXManager.USER_NICKNAME_STORAGE_KEY, String(userInfo.nickname.trim()));
        sys.localStorage.setItem(WXManager.USER_AVATAR_URL_STORAGE_KEY, String(userInfo.avatarUrl.trim()));
    }

    private clearCachedUserProfile(): void {
        if (!isWechat()) {
            return;
        }

        sys.localStorage.removeItem(WXManager.USER_NICKNAME_STORAGE_KEY);
        sys.localStorage.removeItem(WXManager.USER_AVATAR_URL_STORAGE_KEY);
    }

    /**
     * 检查是否已授权读取用户信息
     */
    public hasUserInfoPermission(): Promise<UserInfoAuthorizeState> {
        return new Promise((resolve) => {
            if (!isWechat()) {
                resolve('unset');
                return;
            }

            // 微信环境：检查用户信息授权状态
            wx.getSetting({
                success: (res) => {
                    const scopeUserInfo = res?.authSetting?.['scope.userInfo'];
                    if (scopeUserInfo === true) {
                        resolve('accept');
                        return;
                    }
                    if (scopeUserInfo === false) {
                        resolve('reject');
                        return;
                    }
                    resolve('unset');
                },
                fail: (err) => {
                    console.warn('检查用户信息授权失败:', err);
                    resolve('unset');
                }
            });
        });
    }

    /**
     * 获取用户信息（昵称和头像）
     * 每次都从微信获取最新数据，不使用缓存；拒绝授权时回退为“豆友+openid后四位”
     * @returns Promise<{ nickname: string; avatarUrl: string }>
     */
    public async getUserInfo(): Promise<{ nickname: string; avatarUrl: string }> {
        if (!isWechat()) return Promise.resolve(null);
        const localUserInfo = this.ensureUserProfileLoadedFromCache();
        if (this.hasRealUserProfile()) {
            return localUserInfo?.getDisplayProfile() ?? { nickname: '', avatarUrl: '' };
        }

        const resolveFallbackProfile = async (): Promise<{ nickname: string; avatarUrl: string }> => {
            if (this.hasRealUserProfile()) {
                return this.ensureUserProfileLoadedFromCache()?.getDisplayProfile() ?? { nickname: '', avatarUrl: '' };
            }

            const openid = await this.getOpenId();
            const fallbackNickname = openid ? `豆友${openid.slice(-4)}` : '豆友';
            localUserInfo?.setProfile(fallbackNickname, '');
            this.clearCachedUserProfile();
            return localUserInfo?.getDisplayProfile() ?? { nickname: fallbackNickname, avatarUrl: '' };
        };

        if (!isWechat()) {
            return await resolveFallbackProfile();
        }

        return new Promise((resolve) => {
            // 直接调用 wx.getUserInfo 获取最新数据
            wx.getUserInfo({
                withCredentials: false,
                lang: 'zh_CN',
                success: async (res) => {
                    const userInfo = res.userInfo;
                    if (userInfo) {
                        const openid = await this.getOpenId();
                        const fallbackNickname = openid ? `豆友${openid.slice(-4)}` : '豆友';
                        localUserInfo?.setProfile(userInfo.nickName?.trim() || fallbackNickname, userInfo.avatarUrl || '');
                        this.setAuthorizedAvatarUrl(userInfo.avatarUrl || '');
                        this.saveCachedUserProfile();
                        console.log('获取用户信息成功:', this._nickname, this._avatarUrl);
                        resolve(localUserInfo?.getDisplayProfile() ?? { nickname: fallbackNickname, avatarUrl: userInfo.avatarUrl || '' });
                        return;
                    }

                    resolve(await resolveFallbackProfile());
                },
                fail: async (err) => {
                    console.warn('获取用户信息失败:', err);
                    resolve(await resolveFallbackProfile());
                }
            });
        });
    }
}

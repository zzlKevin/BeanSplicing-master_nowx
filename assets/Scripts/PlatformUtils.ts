/**
 * PlatformUtils - 平台检测工具
 * 用于判断当前运行环境是微信小游戏还是原生安卓/iOS/Web
 */
import { sys } from 'cc';

export enum PlatformType {
    WECHAT = 'wechat',
    NATIVE = 'native',
    WEB = 'web',
    UNKNOWN = 'unknown',
}

let _cachedPlatform: PlatformType | null = null;

/**
 * 检测当前运行平台
 */
export function getPlatformType(): PlatformType {
    if (_cachedPlatform !== null) {
        return _cachedPlatform;
    }

    if (typeof window !== 'undefined' && typeof (window as any).wx !== 'undefined') {
        _cachedPlatform = PlatformType.WECHAT;
        return _cachedPlatform;
    }

    const platform = sys.platform;
    if (platform === sys.Platform.ANDROID || platform === sys.Platform.IOS) {
        _cachedPlatform = PlatformType.NATIVE;
        return _cachedPlatform;
    }

    if (platform === sys.Platform.HTML5 || platform === sys.Platform.DESKTOP_BROWSER) {
        _cachedPlatform = PlatformType.WEB;
        return _cachedPlatform;
    }

    _cachedPlatform = PlatformType.UNKNOWN;
    return _cachedPlatform;
}

export function isWechat(): boolean {
    return getPlatformType() === PlatformType.WECHAT;
}

export function isNative(): boolean {
    return getPlatformType() === PlatformType.NATIVE;
}

export function isNonWechat(): boolean {
    return !isWechat();
}

export function resetPlatformCache(): void {
    _cachedPlatform = null;
}

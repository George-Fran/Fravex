declare module 'ruhend-scraper' {
  export interface TikTokResult {
    region?: string;
    title?: string;
    avatar?: string;
    author?: string;
    username?: string;
    comment?: string;
    views?: string;
    cover?: string;
    like?: string;
    bookmark?: string;
    published?: string;
    video?: string;
    video_wm?: string;
    video_hd?: string;
    music?: string;
    duration?: string;
  }

  export interface InstagramMediaItem {
    thumbnail?: string;
    url?: string;
  }

  export interface InstagramResult {
    status?: boolean;
    data?: InstagramMediaItem[];
  }

  export function ttdl(url: string): Promise<TikTokResult>;
  export function igdl(url: string): Promise<unknown>;
  export function igdl2(url: string): Promise<InstagramResult>;
}

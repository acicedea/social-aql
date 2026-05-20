export interface MetaTokenBundle {
  userAccessToken: string;
  pageAccessToken: string;
  pageId: string;
  expiresAt: string;
}

export interface GraphPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

export interface GraphIgAccount {
  id: string;
  name: string;
  username: string;
  profile_picture_url: string | null;
  followers_count: number;
  follows_count: number;
  media_count: number;
}

export interface GraphMedia {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_product_type?: 'REELS' | 'FEED' | 'STORY';
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

export interface GraphInsightValue {
  value: number;
  end_time: string;
}

export interface GraphInsight {
  id: string;
  name: string;
  period: string;
  values: GraphInsightValue[];
}

export interface GraphError {
  message: string;
  type: string;
  code: number;
  fbtrace_id?: string;
}

export interface GraphErrorResponse {
  error: GraphError;
}

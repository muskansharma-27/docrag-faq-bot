export interface Document {
  id: string;
  title: string;
  content: string;
  fileData?: string;
  version: number;
  authorId: string;
  createdAt: any;
  updatedAt: any;
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'bot';
  createdAt: any;
}

export interface AnalyticsData {
  date: string;
  queries: number;
  accuracy: number;
}

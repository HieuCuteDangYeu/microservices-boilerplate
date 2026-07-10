export type SearchSuggestionType = 'all' | 'users' | 'reels';

export type SearchSuggestionSource =
  | 'trending_reel_tag'
  | 'recent_reel_topic'
  | 'personalized_reel_tag';

export interface SearchSuggestionItem {
  label: string;
  query: string;
  source: SearchSuggestionSource;
  score?: number;
}

export interface SearchSuggestionsResponse {
  suggestions: SearchSuggestionItem[];
}

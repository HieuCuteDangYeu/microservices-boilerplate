export interface UserResponse {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
}

export interface FindAllUsersPayload {
  page: number;
  limit: number;
  search?: string;
  sort?: 'asc' | 'desc';
}

export interface PaginatedUsersResponse {
  data: UserResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    lastPage: number;
  };
}

export interface UserResponse {
  id: string;
  email: string;
  createdAt: Date;
}

export interface FindAllUsersPayload {
  page: number;
  limit: number;
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

import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

class ApiClient {
	private client: AxiosInstance;
	private refreshingToken: Promise<void> | null = null;

	constructor() {
		this.client = axios.create({
			baseURL: API_BASE_URL,
			headers: {
				'Content-Type': 'application/json',
			},
		});

		// Request interceptor to add auth token
		this.client.interceptors.request.use(
			(config) => {
				const token = localStorage.getItem('access_token');
				if (token) {
					config.headers.Authorization = `Bearer ${token}`;
				}
				return config;
			},
			(error) => Promise.reject(error)
		);

		// Response interceptor to handle token refresh
		this.client.interceptors.response.use(
			(response) => response,
			async (error) => {
				const originalRequest = error.config;

				if (error.response?.status === 401 && !originalRequest._retry) {
					originalRequest._retry = true;

					if (!this.refreshingToken) {
						this.refreshingToken = this.refreshToken();
					}

					try {
						await this.refreshingToken;
						this.refreshingToken = null;
						return this.client(originalRequest);
					} catch (refreshError) {
						this.logout();
						throw refreshError;
					}
				}

				return Promise.reject(error);
			}
		);
	}

	private async refreshToken(): Promise<void> {
		const refreshToken = localStorage.getItem('refresh_token');
		if (!refreshToken) {
			throw new Error('No refresh token available');
		}

		try {
			const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
				refresh_token: refreshToken,
			});

			localStorage.setItem('access_token', response.data.access_token);
			localStorage.setItem('refresh_token', response.data.refresh_token);
		} catch (error) {
			this.logout();
			throw error;
		}
	}

	private logout(): void {
		localStorage.removeItem('access_token');
		localStorage.removeItem('refresh_token');
		window.location.href = '/login';
	}

	// Auth endpoints
	async login(email: string, password: string) {
		const formData = new FormData();
		formData.append('username', email);
		formData.append('password', password);

		const response = await this.client.post('/auth/login', formData, {
			headers: { 'Content-Type': 'multipart/form-data' },
		});

		localStorage.setItem('access_token', response.data.access_token);
		localStorage.setItem('refresh_token', response.data.refresh_token);

		return response.data;
	}

	async register(email: string, password: string) {
		return this.client.post('/auth/register', { email, password });
	}

	// Transaction endpoints
	async getTransactions(params?: any) {
		return this.client.get('/transactions', { params });
	}

	async getReviewQueue() {
		return this.client.get('/transactions/review');
	}

	async categorizeTransaction(id: string, data: any) {
		return this.client.put(`/transactions/${id}/categorize`, data);
	}

	async bulkCategorize(transactionIds: string[], categoryId: string, vendorId?: string) {
		return this.client.post('/transactions/bulk-categorize', {
			transaction_ids: transactionIds,
			category_id: categoryId,
			vendor_id: vendorId,
		});
	}

	// Category endpoints
	async getCategories() {
		return this.client.get('/categories');
	}

	async createCategory(data: any) {
		return this.client.post('/categories', data);
	}

	async updateCategory(id: string, data: any) {
		return this.client.put(`/categories/${id}`, data);
	}

	async deleteCategory(id: string) {
		return this.client.delete(`/categories/${id}`);
	}

	// Budget endpoints
	async getCurrentBudget() {
		return this.client.get('/budgets/current');
	}

	async getDailyAllowances() {
		return this.client.get('/budgets/daily-allowances');
	}

	async createOrUpdateBudget(period: string, categoryId: string, amount: number) {
		return this.client.post('/budgets/period', {
			period,
			category_id: categoryId,
			budgeted_amount: amount,
		});
	}

	// Upload endpoints
	async uploadCSV(file: File, mappingId?: string) {
		const formData = new FormData();
		formData.append('file', file);
		if (mappingId) {
			formData.append('mapping_id', mappingId);
		}

		return this.client.post('/uploads/csv', formData, {
			headers: { 'Content-Type': 'multipart/form-data' },
		});
	}

	async getUploadStatus(uploadId: string) {
		return this.client.get(`/uploads/${uploadId}/status`);
	}

	// Vendor endpoints
	async getVendors() {
		return this.client.get('/vendors');
	}

	async createVendor(data: any) {
		return this.client.post('/vendors', data);
	}

	async learnVendor(transactionId: string, vendorName: string, categoryId: string) {
		return this.client.post('/vendors/learn', {
			transaction_id: transactionId,
			vendor_name: vendorName,
			category_id: categoryId,
		});
	}
}

export const apiClient = new ApiClient();

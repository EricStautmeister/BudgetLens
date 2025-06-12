import axios, { AxiosInstance } from 'axios';

// Auto-detect the API URL based on environment
const getApiBaseUrl = (): string => {
	// Environment variable takes precedence
	if (import.meta.env.VITE_API_URL) {
		return import.meta.env.VITE_API_URL;
	}

	// Auto-detect based on current hostname
	const hostname = window.location.hostname;
	const protocol = window.location.protocol;

	// If accessing via localhost, use localhost for API
	if (hostname === 'localhost' || hostname === '127.0.0.1') {
		return 'http://localhost:8000/api/v1';
	}

	// For multi-device setup, construct API URL using current hostname
	// This assumes your backend is running on port 8000 on the same machine as the frontend proxy
	return `${protocol}//${hostname}:8000/api/v1`;
};

const API_BASE_URL = getApiBaseUrl();

console.log('API Base URL:', API_BASE_URL); // Debug log

class ApiClient {
	private client: AxiosInstance;
	private refreshingToken: Promise<void> | null = null;

	constructor() {
		this.client = axios.create({
			baseURL: API_BASE_URL,
			headers: {
				'Content-Type': 'application/json',
			},
			timeout: 10000, // 10 second timeout
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
			}, {
				headers: {
					'Content-Type': 'application/json'
				}
			});

			localStorage.setItem('access_token', response.data.access_token);
			localStorage.setItem('refresh_token', response.data.refresh_token);
		} catch (error) {
			console.error('Token refresh failed:', error);
			this.logout();
			throw error;
		}
	}

	private logout(): void {
		localStorage.removeItem('access_token');
		localStorage.removeItem('refresh_token');
		window.location.href = '/login';
	}

	// Helper function to clean query parameters
	private cleanParams(params: any): any {
		if (!params) return {};

		const cleaned = { ...params };

		// Remove empty strings and null/undefined values
		Object.keys(cleaned).forEach(key => {
			if (cleaned[key] === '' || cleaned[key] == null) {
				delete cleaned[key];
			}
		});

		return cleaned;
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
		const cleanedParams = this.cleanParams(params);
		return this.client.get('/transactions/', { params: cleanedParams });
	}

	async getReviewQueue() {
		return this.client.get('/transactions/review');
	}

	async categorizeTransaction(id: string, data: any, learnPatterns: boolean = true) {
		return this.client.put(`/transactions/${id}/categorize?learn_patterns=${learnPatterns}`, data);
	}

	async getVendorSuggestions(transactionId: string) {
		return this.client.get(`/transactions/${transactionId}/vendor-suggestions`);
	}

	async getLearnedPatterns() {
		return this.client.get(`/transactions/patterns`);
	}

	async debugVendorExtraction(description: string) {
		return this.client.get(`/transactions/debug-vendor-extraction`, {
			params: { description }
		});
	}

	async bulkCategorize(transactionIds: string[], categoryId: string, vendorId?: string) {
		const payload: any = {
			transaction_ids: transactionIds,
			category_id: categoryId,
		};

		if (vendorId) {
			payload.vendor_id = vendorId;
		}

		return this.client.post('/transactions/bulk-categorize', payload);
	}

	// Category endpoints
	async getCategories() {
		return this.client.get('/categories/');
	}

	async createCategory(data: {
		name: string;
		category_type: string;
		parent_category_id?: string;
		is_automatic_deduction?: boolean;
		is_savings?: boolean;
		allow_auto_learning?: boolean;
	}) {
		return this.client.post('/categories/', data);
	}

	async updateCategory(id: string, data: {
		name?: string;
		category_type?: string;
		parent_category_id?: string;
		is_automatic_deduction?: boolean;
		is_savings?: boolean;
		allow_auto_learning?: boolean;
	}) {
		return this.client.put(`/categories/${id}`, data);
	}

	async deleteCategory(id: string, force: boolean = false) {
		return this.client.delete(`/categories/${id}`, {
			params: { force }
		});
	}

	async getCategoriesHierarchy() {
		return this.client.get('/categories/hierarchy');
	}

	async getCategoryStats(periodMonths: number = 12) {
		return this.client.get('/categories/stats', {
			params: { period_months: periodMonths }
		});
	}

	async initializeDefaultCategories() {
		return this.client.post('/categories/init-defaults');
	}

	async getCategoryTypes() {
		return this.client.get('/categories/types');
	}

	async getManualReviewCategories() {
		return this.client.get('/categories/manual-review');
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
		return this.client.get('/vendors/');
	}

	async createVendor(data: any) {
		return this.client.post('/vendors/', data);
	}

	async learnVendor(transactionId: string, vendorName: string, categoryId: string) {
		return this.client.post('/vendors/learn', {
			transaction_id: transactionId,
			vendor_name: vendorName,
			category_id: categoryId,
		});
	}

	async getCSVMappings() {
		return this.client.get('/uploads/mappings');
	}

	// Upload Management endpoints
	async getUploads(skip = 0, limit = 50) {
		return this.client.get('/upload-management/', {
			params: { skip, limit }
		});
	}

	async deleteUpload(uploadId: string) {
		return this.client.delete(`/upload-management/${uploadId}`);
	}

	async getUploadTransactions(uploadId: string) {
		return this.client.get(`/upload-management/${uploadId}/transactions`);
	}

	async retryFailedUpload(uploadId: string) {
		return this.client.post(`/upload-management/${uploadId}/retry`);
	}

	async getUploadStats() {
		return this.client.get('/upload-management/stats');
	}

	async getAccounts() {
		return this.client.get('/accounts/');
	}

	async getAccount(accountId: string) {
		return this.client.get(`/accounts/${accountId}`);
	}

	async createAccount(data: any) {
		return this.client.post('/accounts/', data);
	}

	async updateAccount(id: string, data: any) {
		return this.client.put(`/accounts/${id}`, data);
	}

	async deleteAccount(id: string) {
		return this.client.delete(`/accounts/${id}`);
	}

	async ensureDefaultAccount() {
		return this.client.post('/accounts/ensure-default');
	}

	// Transfer Management endpoints
	async detectTransfers(daysLookback: number = 7) {
		return this.client.get('/transfers/detect', {
			params: { days_lookback: daysLookback }
		});
	}

	async getTransfers(limit: number = 50) {
		return this.client.get('/transfers/', {
			params: { limit }
		});
	}

	async createManualTransfer(data: { from_transaction_id: string; to_transaction_id: string; amount: number }) {
		return this.client.post('/transfers/match', data);
	}

	async deleteTransfer(transferId: string) {
		return this.client.delete(`/transfers/${transferId}`);
	}

	// Updated Transaction endpoints with account support
	async assignTransactionToAccount(transactionId: string, accountId: string) {
		return this.client.put(`/transactions/${transactionId}/assign-account`, {}, {
			params: { account_id: accountId }
		});
	}

	async bulkAssignAccount(transactionIds: string[], accountId: string) {
		return this.client.post('/transactions/bulk-assign-account', {
			transaction_ids: transactionIds,
			account_id: accountId,
		});
	}

	async getUnassignedTransactions(limit: number = 100) {
		return this.client.get('/transactions/unassigned-accounts', {
			params: { limit }
		});
	}

	async autoAssignAccounts() {
		return this.client.post('/transactions/auto-assign-accounts');
	}

	// Updated upload endpoint with account assignment
	async uploadCSVWithAccount(file: File, accountId?: string, mappingId?: string) {
		const formData = new FormData();
		formData.append('file', file);
		if (accountId) {
			formData.append('account_id', accountId);
		}
		if (mappingId) {
			formData.append('mapping_id', mappingId);
		}

		return this.client.post('/uploads/csv', formData, {
			headers: { 'Content-Type': 'multipart/form-data' },
		});
	}

	// Helper method to get transactions with account filtering
	async getTransactionsWithAccountFilter(params?: any) {
		const cleanedParams = this.cleanParams(params);
		return this.client.get('/transactions/', { params: cleanedParams });
	}

	async adjustAccountBalance(accountId: string, data: { amount: number; description?: string }) {
		return this.client.post(`/accounts/${accountId}/adjust-balance`, data);
	}

	async setAccountBalance(accountId: string, data: { new_balance: number; description?: string }) {
		return this.client.post(`/accounts/${accountId}/set-balance`, data);
	}

	async getAccountBalanceHistory(accountId: string, limit: number = 10) {
		return this.client.get(`/accounts/${accountId}/balance-history?limit=${limit}`);
	}
}

export const apiClient = new ApiClient();
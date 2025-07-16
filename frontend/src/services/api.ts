import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig, AxiosResponse, AxiosError, AxiosHeaders } from 'axios';

interface RequestConfigWithMetadata extends InternalAxiosRequestConfig {
	metadata?: {
		startTime: number;
	};
	_retry?: boolean;
}

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
	private debugMode: boolean = false;
	private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();

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
			(config: InternalAxiosRequestConfig): RequestConfigWithMetadata => {
				const configWithMetadata = config as RequestConfigWithMetadata;

				// Add rate limiting check
				if (!this.checkRateLimit(config.url || 'unknown')) {
					return Promise.reject(new Error('Rate limit exceeded. Please try again later.')) as any;
				}

				// Add token
				const token = localStorage.getItem('access_token');
				if (token) {
					if (!configWithMetadata.headers) {
						configWithMetadata.headers = new AxiosHeaders();
					}
					configWithMetadata.headers.set('Authorization', `Bearer ${token}`);
				}

				// Add request timestamp for timeout tracking
				configWithMetadata.metadata = { startTime: Date.now() };

				return configWithMetadata;
			},
			(error) => Promise.reject(error)
		);

		// Response interceptor to handle token refresh
		this.client.interceptors.response.use(
			(response: AxiosResponse) => {
				// Log slow requests
				const config = response.config as RequestConfigWithMetadata;
				if (config.metadata) {
					const duration = Date.now() - config.metadata.startTime;
					if (duration > 5000) { // 5 seconds
						console.warn(`Slow request: ${config.url} took ${duration}ms`);
					}
				}
				return response;
			},
			async (error: AxiosError) => {
				const originalRequest = error.config as RequestConfigWithMetadata;

				if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
					originalRequest._retry = true;

					// Prevent multiple simultaneous refresh attempts
					if (!this.refreshingToken) {
						this.refreshingToken = this.refreshToken();
					}

					try {
						await this.refreshingToken;
						this.refreshingToken = null;
						return this.client(originalRequest);
					} catch (refreshError) {
						this.refreshingToken = null;
						this.logout();
						throw refreshError;
					}
				}

				// Enhanced error handling
				if (error.code === 'ECONNABORTED') {
					throw new Error('Request timeout. Please check your connection and try again.');
				}

				if (!error.response) {
					throw new Error('Network error. Please check your connection.');
				}

				return Promise.reject(error);
			}
		);
	}

	enableDebugMode(): void {
		this.debugMode = true;
		console.log('API Client debug mode enabled');
	}

	private debugLog(message: string, data?: any): void {
		if (this.debugMode) {
			console.log(`[API Debug] ${message}`, data);
		}
	}

	private async refreshToken(): Promise<void> {
		const refreshToken = localStorage.getItem('refresh_token');
		if (!refreshToken) {
			this.logout();
			throw new Error('No refresh token available');
		}

		try {
			const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
				refresh_token: refreshToken,
			}, {
				headers: {
					'Content-Type': 'application/json'
				},
				timeout: 10000 // 10 second timeout
			});

			// Validate response
			if (!response.data.access_token || !response.data.refresh_token) {
				throw new Error('Invalid response from refresh endpoint');
			}

			// Use secure storage if available, fallback to localStorage
			this.secureStore('access_token', response.data.access_token);
			this.secureStore('refresh_token', response.data.refresh_token);

		} catch (error) {
			console.error('Token refresh failed:', error);
			this.logout();
			throw error;
		}
	}

	private secureStore(key: string, value: string): void {
		try {
			// Basic validation
			if (!value || typeof value !== 'string') {
				throw new Error('Invalid token value');
			}

			// For now, use localStorage but with validation
			// In production, consider using httpOnly cookies or secure storage
			localStorage.setItem(key, value);
		} catch (error) {
			console.error(`Failed to store ${key}:`, error);
			// Handle storage failure gracefully
		}
	}

	private validateAmount(amount: number): boolean {
		return !isNaN(amount) && isFinite(amount) && amount >= 0;
	}

	private sanitizeString(input: string): string {
		// Basic XSS prevention
		return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
			.replace(/javascript:/gi, '')
			.trim();
	}

	private logout(): void {
		try {
			localStorage.removeItem('access_token');
			localStorage.removeItem('refresh_token');

			// Clear any cached data
			if (this.refreshingToken) {
				this.refreshingToken = null;
			}

			// Redirect to login
			window.location.href = '/login';
		} catch (error) {
			console.error('Logout failed:', error);
			// Force redirect even if cleanup fails
			window.location.href = '/login';
		}
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

		// Format date objects to YYYY-MM-DD strings for backend compatibility
		if (cleaned.start_date instanceof Date) {
			console.log('🔍 FRONTEND DEBUG: Original start_date:', cleaned.start_date);
			console.log('🔍 FRONTEND DEBUG: start_date toISOString():', cleaned.start_date.toISOString());
			// Use local date format to avoid timezone issues
			const year = cleaned.start_date.getFullYear();
			const month = String(cleaned.start_date.getMonth() + 1).padStart(2, '0');
			const day = String(cleaned.start_date.getDate()).padStart(2, '0');
			cleaned.start_date = `${year}-${month}-${day}`;
			console.log('🔍 FRONTEND DEBUG: Formatted start_date:', cleaned.start_date);
		}
		if (cleaned.end_date instanceof Date) {
			console.log('🔍 FRONTEND DEBUG: Original end_date:', cleaned.end_date);
			console.log('🔍 FRONTEND DEBUG: end_date toISOString():', cleaned.end_date.toISOString());
			// Use local date format to avoid timezone issues
			const year = cleaned.end_date.getFullYear();
			const month = String(cleaned.end_date.getMonth() + 1).padStart(2, '0');
			const day = String(cleaned.end_date.getDate()).padStart(2, '0');
			cleaned.end_date = `${year}-${month}-${day}`;
			console.log('🔍 FRONTEND DEBUG: Formatted end_date:', cleaned.end_date);
		}

		return cleaned;
	}

	private checkRateLimit(endpoint: string, maxRequests: number = 100, windowMs: number = 60000): boolean {
		const now = Date.now();
		const key = endpoint;
		const current = this.requestCounts.get(key) || { count: 0, resetTime: now + windowMs };

		if (now > current.resetTime) {
			// Reset window
			current.count = 1;
			current.resetTime = now + windowMs;
		} else {
			current.count++;
		}

		this.requestCounts.set(key, current);

		if (current.count > maxRequests) {
			console.warn(`Rate limit exceeded for ${endpoint}`);
			return false;
		}

		return true;
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

	async updateTransaction(id: string, data: any) {
		return this.client.put(`/transactions/${id}`, data);
	}

	async getVendorSuggestions(transactionId: string) {
		return this.client.get(`/transactions/${transactionId}/vendor-suggestions`);
	}

	// New intelligent vendor suggestion methods
	async getIntelligentVendorSuggestions(description: string, limit: number = 5) {
		return this.client.get(`/vendors/suggest`, {
			params: { description, limit }
		});
	}

	async getVendorHierarchyAnalysis() {
		return this.client.get(`/vendors/hierarchy-analysis`);
	}

	async getComprehensiveVendorSuggestion(description: string) {
		return this.client.post(`/vendors/comprehensive-suggestion`, { description });
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
	async getCurrentBudget(params?: { month?: string }) {
		try {
			let url = '/budgets/current';
			if (params?.month) {
				// Use the period endpoint for specific months
				// Convert YYYY-MM to YYYY-MM-01 for the date parameter
				const periodDate = `${params.month}-01`;
				url = `/budgets/period/${periodDate}`;
			}
			const response = await this.client.get(url);
			return response;
		} catch (error) {
			this.debugLog('Error fetching current budget:', error);
			// Return empty budget structure for new users rather than error
			if (error.response?.status === 404) {
				const allCategories = await this.getCategories();
				// Map categories to empty budget entries
				const budgetCategories = allCategories.data.map((cat: any) => ({
					category_id: cat.id,
					category_name: cat.name,
					budgeted: 0,
					spent: 0,
					remaining: 0,
					daily_allowance: 0,
					percentage_used: 0,
					is_automatic: cat.is_automatic_deduction,
					is_savings: cat.is_savings
				}));

				return {
					data: {
						period: new Date().toISOString().split('T')[0],
						categories: budgetCategories,
						total_budgeted: 0,
						total_spent: 0,
						days_remaining: 30
					}
				};
			}
			throw error;
		}
	}

	async getCurrentBudgetGrouped() {
		try {
			const response = await this.client.get('/budgets/current/grouped');
			return response;
		} catch (error) {
			this.debugLog('Error fetching current grouped budget:', error);
			throw error;
		}
	}

	async getDailyAllowances(params?: { month?: string }) {
		try {
			let url = '/budgets/daily-allowances';
			if (params?.month) {
				url = `/budgets/daily-allowances?month=${params.month}`;
			}
			return await this.client.get(url);
		} catch (error) {
			this.debugLog('Error fetching daily allowances:', error);
			// Return empty array for new users rather than error
			if (error.response?.status === 404) {
				return { data: [] };
			}
			throw error;
		}
	}

	async getBudgetForPeriod(period: string) {
		try {
			const response = await this.client.get(`/budgets/period/${period}`);
			return response;
		} catch (error) {
			this.debugLog('Error fetching budget for period:', error);
			throw error;
		}
	}

	async getBudgetForPeriodGrouped(period: string) {
		try {
			const response = await this.client.get(`/budgets/period/${period}/grouped`);
			return response;
		} catch (error) {
			this.debugLog('Error fetching grouped budget for period:', error);
			throw error;
		}
	}

	async getBudgetComparison(currentPeriod: string, comparePeriod: string) {
		try {
			const response = await this.client.get('/budgets/comparison', {
				params: {
					current_period: currentPeriod,
					compare_period: comparePeriod
				}
			});
			return response;
		} catch (error) {
			this.debugLog('Error fetching budget comparison:', error);
			throw error;
		}
	}

	async getBudgetHistory(months: number = 6) {
		try {
			const response = await this.client.get('/budgets/history', {
				params: { months }
			});
			return response;
		} catch (error) {
			this.debugLog('Error fetching budget history:', error);
			throw error;
		}
	}

	async createOrUpdateBudget(period: string, categoryId: string, amount: number) {
		return this.client.post('/budgets/period', {
			period,
			category_id: categoryId,
			budgeted_amount: amount,
		});
	}

	async bulkUpdateBudget(period: string, updates: Array<{ category_id: string, amount: number }>) {
		return this.client.post('/budgets/bulk-update', {
			period,
			updates
		});
	}

	async copyBudget(fromPeriod: string, toPeriod: string) {
		return this.client.post('/budgets/copy', {
			from_period: fromPeriod,
			to_period: toPeriod
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

	async createManualTransfer(data: { from_transaction_id: string; to_transaction_id: string; amount: number }, learnPattern: boolean = true) {
		return this.client.post('/transfers/match', data, {
			params: { learn_pattern: learnPattern }
		});
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
		// Validate file
		if (!file || file.type !== 'text/csv') {
			throw new Error('Invalid file type. Only CSV files are allowed.');
		}

		if (file.size > 10 * 1024 * 1024) { // 10MB limit
			throw new Error('File too large. Maximum size is 10MB.');
		}

		// Sanitize filename
		const sanitizedFilename = this.sanitizeString(file.name);

		const formData = new FormData();

		// Create a new file with sanitized name
		const sanitizedFile = new File([file], sanitizedFilename, { type: file.type });
		formData.append('file', sanitizedFile);

		if (accountId) {
			// Validate UUID format
			if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) {
				throw new Error('Invalid account ID format');
			}
			formData.append('account_id', accountId);
		}

		if (mappingId) {
			if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mappingId)) {
				throw new Error('Invalid mapping ID format');
			}
			formData.append('mapping_id', mappingId);
		}

		return this.client.post('/uploads/csv', formData, {
			headers: { 'Content-Type': 'multipart/form-data' },
			timeout: 60000 // 60 second timeout for file uploads
		});
	}

	// Helper method to get transactions with account filtering
	async getTransactionsWithAccountFilter(params?: any) {
		const cleanedParams = this.cleanParams(params);
		return this.client.get('/transactions/', { params: cleanedParams });
	}

	async adjustAccountBalance(accountId: string, data: { amount: number; description?: string }) {
		if (!this.validateAmount(Math.abs(data.amount))) {
			throw new Error('Invalid amount');
		}

		if (data.description) {
			data.description = this.sanitizeString(data.description);
		}

		return this.client.post(`/accounts/${accountId}/adjust-balance`, data);
	}

	async setAccountBalance(accountId: string, data: { new_balance: number; description?: string; as_of_date?: string }) {
		// Allow negative balances for account balance setting
		if (isNaN(data.new_balance) || !isFinite(data.new_balance)) {
			throw new Error('Invalid balance amount');
		}

		if (data.description) {
			data.description = this.sanitizeString(data.description);
		}

		return this.client.post(`/accounts/${accountId}/set-balance`, data);
	}

	async previewAccountBalance(accountId: string, data: { new_balance: number; as_of_date: string }) {
		// Allow negative balances for account balance setting
		if (isNaN(data.new_balance) || !isFinite(data.new_balance)) {
			throw new Error('Invalid balance amount');
		}

		return this.client.post(`/accounts/${accountId}/preview-balance`, data);
	}

	async getAccountBalanceHistory(accountId: string, limit: number = 10) {
		return this.client.get(`/accounts/${accountId}/balance-history?limit=${limit}`);
	}

	// General Settings API
	async getSettings() {
		return this.client.get('/settings');
	}

	async saveSettings(settings: any) {
		return this.client.post('/settings', settings);
	}

	// Transfer Settings API
	async getTransferSettings() {
		return this.client.get('/transfers/settings');
	}

	async saveTransferSettings(settings: any) {
		return this.client.post('/transfers/settings', settings);
	}

	async testTransferRules(settings: any) {
		return this.client.post('/transfers/test-rules', settings);
	}

	// Enhanced transfer detection
	async detectTransfersEnhanced(settings?: any) {
		return this.client.post('/transfers/detect-enhanced', settings || {});
	}

	async getTransferSuggestions(limit: number = 20) {
		return this.client.get('/transfers/suggestions', {
			params: { limit }
		});
	}

	// Transfer pattern management endpoints
	async getTransferPatterns() {
		return this.client.get('/transfers/patterns');
	}

	async updateTransferPattern(patternId: string, settings: any) {
		return this.client.put(`/transfers/patterns/${patternId}`, settings);
	}

	async deleteTransferPattern(patternId: string) {
		return this.client.delete(`/transfers/patterns/${patternId}`);
	}

	// Savings mappings API
	async getSavingsMappings() {
		return this.client.get('/savings/mappings');
	}

	async createSavingsMapping(data: {
		savings_category_id: string;
		account_id: string;
		target_amount?: number;
		current_amount?: number;
	}) {
		return this.client.post('/savings/mappings', data);
	}

	async deleteSavingsMapping(mappingId: string) {
		return this.client.delete(`/savings/mappings/${mappingId}`);
	}

	// Unallocated transfers API
	async getUnallocatedTransfers(limit: number = 10) {
		return this.client.get('/transfers/unallocated', {
			params: { limit }
		});
	}

	// Savings Pockets API
	async getSavingsPockets() {
		return this.client.get('/savings-pockets');
	}

	async createSavingsPocket(data: {
		name: string;
		description?: string;
		target_amount?: number;
		account_id: string;
		color?: string;
		icon?: string;
	}) {
		return this.client.post('/savings-pockets', data);
	}

	async updateSavingsPocket(pocketId: string, data: {
		name?: string;
		description?: string;
		target_amount?: number;
		color?: string;
		icon?: string;
	}) {
		return this.client.put(`/savings-pockets/${pocketId}`, data);
	}

	async deleteSavingsPocket(pocketId: string) {
		return this.client.delete(`/savings-pockets/${pocketId}`);
	}

	async toggleSavingsPocketActive(pocketId: string) {
		return this.client.put(`/savings-pockets/${pocketId}/toggle-active`, {});
	}

	async adjustSavingsPocketBalance(pocketId: string, data: {
		amount: number;
		reason?: string;
	}) {
		return this.client.post(`/savings-pockets/${pocketId}/adjust-balance`, data);
	}

	async assignTransferToPocket(transferId: string, pocketId: string) {
		return this.client.post(`/transfers/${transferId}/assign-to-pocket`, { pocket_id: pocketId });
	}

	// User Settings API
	async getUserSettings() {
		return this.client.get('/user-settings');
	}

	async updateUserSettings(data: {
		show_transaction_details?: boolean;
		show_reference_number?: boolean;
		show_payment_method?: boolean;
		show_location?: boolean;
		default_currency?: string;
		date_format?: string;
		number_format?: string;
		default_account_for_transfers?: string;
	}) {
		return this.client.put('/user-settings', data);
	}
}

export const apiClient = new ApiClient();
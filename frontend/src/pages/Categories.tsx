// frontend/src/pages/Categories.tsx - Updated with hierarchical categories

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Box,
	Paper,
	Typography,
	Button,
	IconButton,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	TextField,
	Checkbox,
	FormControlLabel,
	Chip,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	Accordion,
	AccordionSummary,
	AccordionDetails,
	Alert,
	Grid,
	Card,
	CardContent,
	Tooltip,
} from '@mui/material';
import {
	Add,
	Edit,
	Delete,
	ExpandMore,
	AccountBalance,
	TrendingDown,
	Savings,
	RateReview,
	Psychology,
	Warning,
	SwapHoriz,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';
import { SavingsAccountMappingDialog } from '../components/SavingsAccountMappingDialog';

// Category type enum to match backend
enum CategoryType {
	INCOME = 'INCOME',
	EXPENSE = 'EXPENSE',
	SAVING = 'SAVING',
	MANUAL_REVIEW = 'MANUAL_REVIEW',
	TRANSFER = 'TRANSFER',
}

interface Category {
	id: string;
	name: string;
	category_type: CategoryType;
	parent_category_id?: string;
	is_automatic_deduction: boolean;
	is_savings: boolean;
	allow_auto_learning: boolean;
	created_at: string;
	transaction_count: number;
	parent_name?: string;
	full_path?: string;
	children?: Category[];
}

interface CategoryHierarchy {
	income: Category[];
	expense: Category[];
	saving: Category[];
	manual_review: Category[];
	transfer: Category[];
}

const categoryTypeLabels = {
	[CategoryType.INCOME]: 'Income',
	[CategoryType.EXPENSE]: 'Expense',
	[CategoryType.SAVING]: 'Saving',
	[CategoryType.MANUAL_REVIEW]: 'Manual Review',
	[CategoryType.TRANSFER]: 'Transfer',
};

const categoryTypeIcons = {
	[CategoryType.INCOME]: <AccountBalance color="success" />,
	[CategoryType.EXPENSE]: <TrendingDown color="error" />,
	[CategoryType.SAVING]: <Savings color="primary" />,
	[CategoryType.MANUAL_REVIEW]: <RateReview color="warning" />,
	[CategoryType.TRANSFER]: <SwapHoriz color="info" />,
};

const categoryTypeColors = {
	[CategoryType.INCOME]: 'success',
	[CategoryType.EXPENSE]: 'error',
	[CategoryType.SAVING]: 'primary',
	[CategoryType.MANUAL_REVIEW]: 'warning',
	[CategoryType.TRANSFER]: 'info',
} as const;

export default function Categories() {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const [open, setOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState<Category | null>(null);
	// const [currentTab, setCurrentTab] = useState(0);
	const [manualReviewGuideOpen, setManualReviewGuideOpen] = useState(false);
	const [savingsMapOpen, setSavingsMapOpen] = useState(false);
	const [selectedSavingsCategory, setSelectedSavingsCategory] = useState<{ id: string, name: string } | null>(null);
	const [formData, setFormData] = useState({
		name: '',
		category_type: CategoryType.EXPENSE,
		parent_category_id: '',
		is_automatic_deduction: false,
		is_savings: false,
		allow_auto_learning: true,
	});

	// Get hierarchical categories
	const { data: hierarchy, isLoading } = useQuery<CategoryHierarchy>({
		queryKey: ['categoriesHierarchy'],
		queryFn: async () => {
			const response = await apiClient.getCategoriesHierarchy();
			return response.data;
		},
	});

	// Get category stats
	const { } = useQuery({
		queryKey: ['categoryStats'],
		queryFn: async () => {
			const response = await apiClient.getCategoryStats();
			return response.data;
		},
	});

	const createMutation = useMutation({
		mutationFn: async (data: any) => {
			return apiClient.createCategory(data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['categoriesHierarchy'] });
			queryClient.invalidateQueries({ queryKey: ['categoryStats'] });
			queryClient.invalidateQueries({ queryKey: ['categories'] });
			enqueueSnackbar('Category created successfully', { variant: 'success' });
			handleClose();
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Failed to create category', { variant: 'error' });
		},
	});

	const updateMutation = useMutation({
		mutationFn: async ({ id, data }: any) => {
			return apiClient.updateCategory(id, data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['categoriesHierarchy'] });
			queryClient.invalidateQueries({ queryKey: ['categoryStats'] });
			queryClient.invalidateQueries({ queryKey: ['categories'] });
			enqueueSnackbar('Category updated successfully', { variant: 'success' });
			handleClose();
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Failed to update category', { variant: 'error' });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async ({ id, force }: { id: string; force: boolean }) => {
			return apiClient.deleteCategory(id, force);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ['categoriesHierarchy'] });
			queryClient.invalidateQueries({ queryKey: ['categoryStats'] });
			queryClient.invalidateQueries({ queryKey: ['categories'] });
			queryClient.invalidateQueries({ queryKey: ['transactions'] });

			const message = data.data.affected_transactions > 0
				? `Category deleted and ${data.data.affected_transactions} transactions marked for review`
				: 'Category deleted successfully';
			enqueueSnackbar(message, { variant: 'success' });
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Delete failed', { variant: 'error' });
		},
	});

	const initDefaultsMutation = useMutation({
		mutationFn: async () => {
			return apiClient.initializeDefaultCategories();
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ['categoriesHierarchy'] });
			queryClient.invalidateQueries({ queryKey: ['categoryStats'] });
			enqueueSnackbar(data.data.message, { variant: 'success' });
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Failed to initialize defaults', { variant: 'error' });
		},
	});

	// Helper to get example categories for each type
	const getExampleCategories = (type: CategoryType): string[] => {
		switch (type) {
			case CategoryType.INCOME:
				return ['Salary', 'Freelance Work', 'Investment Returns', 'Rental Income'];
			case CategoryType.EXPENSE:
				return ['Groceries', 'Utilities', 'Transportation', 'Entertainment'];
			case CategoryType.SAVING:
				return ['Emergency Fund', 'Vacation Fund', 'Retirement Savings'];
			case CategoryType.MANUAL_REVIEW:
				return ['TWINT Payments', 'ATM Withdrawals', 'Generic Bank Transfers', 'Cash Transactions'];
			case CategoryType.TRANSFER:
				return ['Account Transfers', 'Inter-Bank Transfers', 'Savings Transfers'];
			default:
				return [];
		}
	};

	const handleOpen = (category?: Category, categoryType?: CategoryType) => {
		if (category) {
			setEditingCategory(category);
			setFormData({
				name: category.name,
				category_type: category.category_type,
				parent_category_id: category.parent_category_id || '',
				is_automatic_deduction: category.is_automatic_deduction,
				is_savings: category.is_savings,
				allow_auto_learning: category.allow_auto_learning,
			});
		} else {
			setEditingCategory(null);
			setFormData({
				name: '',
				category_type: categoryType || CategoryType.EXPENSE,
				parent_category_id: '',
				is_automatic_deduction: false,
				is_savings: false,
				allow_auto_learning: true,
			});
		}
		setOpen(true);
	};

	const handleClose = () => {
		setOpen(false);
		setEditingCategory(null);
	};

	const handleOpenSavingsMapping = (category?: Category) => {
		if (category) {
			setSelectedSavingsCategory({ id: category.id, name: category.name });
		} else {
			setSelectedSavingsCategory(null);
		}
		setSavingsMapOpen(true);
	};

	const handleCloseSavingsMapping = () => {
		setSavingsMapOpen(false);
		setSelectedSavingsCategory(null);
	};

	const handleSubmit = () => {
		const submitData = { ...formData };

		// Clean up parent_category_id
		if (!submitData.parent_category_id) {
			delete submitData.parent_category_id;
		}

		if (editingCategory) {
			updateMutation.mutate({ id: editingCategory.id, data: submitData });
		} else {
			createMutation.mutate(submitData);
		}
	};

	const handleCreateManualReviewCategory = (categoryName: string) => {
		const submitData = {
			name: categoryName,
			category_type: CategoryType.MANUAL_REVIEW,
			allow_auto_learning: false,
			is_automatic_deduction: false,
			is_savings: false,
		};
		createMutation.mutate(submitData);
	};

	const handleDelete = (category: Category) => {
		const hasTransactions = category.transaction_count > 0;
		const message = hasTransactions
			? `Delete "${category.name}"? This will mark ${category.transaction_count} transactions for review.`
			: `Delete "${category.name}"?`;

		if (confirm(message)) {
			deleteMutation.mutate({ id: category.id, force: hasTransactions });
		}
	};

	const getPotentialParents = (categoryType: CategoryType): Category[] => {
		if (!hierarchy) return [];

		const categoriesOfType = hierarchy[categoryType.toLowerCase() as keyof CategoryHierarchy] || [];
		return categoriesOfType.filter(cat => !cat.parent_category_id); // Only root categories as parents
	};

	const getTotalCategories = (): number => {
		if (!hierarchy) return 0;
		return (hierarchy.income?.length || 0) +
			(hierarchy.expense?.length || 0) +
			(hierarchy.saving?.length || 0) +
			(hierarchy.manual_review?.length || 0) +
			(hierarchy.transfer?.length || 0);
	};

	const renderCategorySection = (title: string, categories: Category[], type: CategoryType, icon: React.ReactNode) => {
		// Group by parent
		const parentCategories = categories.filter(cat => !cat.parent_category_id);
		const childCategories = categories.filter(cat => cat.parent_category_id);

		return (
			<Accordion defaultExpanded>
				<AccordionSummary expandIcon={<ExpandMore />}>
					<Box display="flex" alignItems="center" gap={2}>
						{icon}
						<Typography variant="h6">{title}</Typography>
						<Chip label={categories.length} size="small" color={categoryTypeColors[type]} />
					</Box>
				</AccordionSummary>
				<AccordionDetails>
					<Box>
						<Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
							<Typography variant="body2" color="textSecondary">
								{type === CategoryType.MANUAL_REVIEW && (
									"Categories for transactions requiring manual classification"
								)}
								{type === CategoryType.INCOME && (
									"Sources of money coming into your accounts"
								)}
								{type === CategoryType.EXPENSE && (
									"Money spent on various goods and services"
								)}
								{type === CategoryType.SAVING && (
									"Savings goals and investment categories"
								)}
								{type === CategoryType.TRANSFER && (
									"Transfer categories facilitate account transfers and money movement"
								)}
							</Typography>
							<Box display="flex" gap={1}>
								{type === CategoryType.SAVING && (
									<Button
										size="small"
										variant="outlined"
										startIcon={<AccountBalance />}
										onClick={() => handleOpenSavingsMapping()}>
										Manage Account Mappings
									</Button>
								)}
								{type === CategoryType.MANUAL_REVIEW ? (
									<Button
										size="small"
										variant="contained"
										color="warning"
										startIcon={<RateReview />}
										onClick={() => setManualReviewGuideOpen(true)}>
										Add Manual Review Category
									</Button>
								) : (
									<Button
										size="small"
										variant="outlined"
										startIcon={<Add />}
										onClick={() => handleOpen(undefined, type)}>
										Add {categoryTypeLabels[type]}
									</Button>
								)}
							</Box>
						</Box>

						{/* Parent categories */}
						{parentCategories.map((category) => {
							const children = childCategories.filter(child => child.parent_category_id === category.id);
							const totalTransactions = category.transaction_count + children.reduce((sum, child) => sum + child.transaction_count, 0);

							return (
								<Box key={category.id} sx={{ mb: 2 }}>
									{children.length > 0 ? (
										/* Parent with children - render as accordion */
										<Accordion defaultExpanded={false}>
											<AccordionSummary expandIcon={<ExpandMore />}>
												<Box display="flex" justifyContent="space-between" alignItems="center" width="100%" sx={{ pr: 1 }}>
													<Box display="flex" alignItems="center" gap={2}>
														<Typography variant="subtitle1" fontWeight="medium">
															{category.name}
														</Typography>
														<Chip
															label={`${totalTransactions} transactions`}
															size="small"
															variant="outlined"
														/>
														<Chip
															label={`${children.length} subcategories`}
															size="small"
															color={categoryTypeColors[type]}
														/>
														{category.is_automatic_deduction && (
															<Chip label="Auto" size="small" color="secondary" />
														)}
														{!category.allow_auto_learning && (
															<Tooltip title="Auto-learning disabled">
																<Chip label="No Learning" size="small" color="warning" />
															</Tooltip>
														)}
													</Box>
													<Box onClick={(e) => e.stopPropagation()}>
														<IconButton onClick={() => handleOpen(category)} size="small">
															<Edit />
														</IconButton>
														<IconButton
															onClick={() => handleDelete(category)}
															size="small"
															color="error"
															disabled={children.length > 0}>
															<Delete />
														</IconButton>
													</Box>
												</Box>
											</AccordionSummary>
											<AccordionDetails>
												<Box sx={{ pl: 2 }}>
													{/* Parent category direct stats */}
													{category.transaction_count > 0 && (
														<Box sx={{ mb: 2 }}>
															<Paper variant="outlined" sx={{ p: 1, bgcolor: 'action.hover' }}>
																<Typography variant="body2" color="text.secondary">
																	Direct transactions: {category.transaction_count}
																</Typography>
															</Paper>
														</Box>
													)}

													{/* Child categories */}
													{children.map((child) => (
														<Box key={child.id} sx={{ mb: 1 }}>
															<Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
																<Box display="flex" justifyContent="space-between" alignItems="center">
																	<Box display="flex" alignItems="center" gap={1}>
																		<Typography variant="body2" color="text.primary">
																			↳ {child.name}
																		</Typography>
																		<Chip
																			label={`${child.transaction_count} transactions`}
																			size="small"
																			variant="outlined"
																		/>
																		{child.is_automatic_deduction && (
																			<Chip label="Auto" size="small" color="secondary" />
																		)}
																		{!child.allow_auto_learning && (
																			<Chip label="No Learning" size="small" color="warning" />
																		)}
																	</Box>
																	<Box>
																		{type === CategoryType.SAVING && (
																			<Tooltip title="Manage account mappings">
																				<IconButton onClick={() => handleOpenSavingsMapping(child)} size="small">
																					<AccountBalance />
																				</IconButton>
																			</Tooltip>
																		)}
																		<IconButton onClick={() => handleOpen(child)} size="small">
																			<Edit />
																		</IconButton>
																		<IconButton
																			onClick={() => handleDelete(child)}
																			size="small"
																			color="error">
																			<Delete />
																		</IconButton>
																	</Box>
																</Box>
															</Paper>
														</Box>
													))}
												</Box>
											</AccordionDetails>
										</Accordion>
									) : (
										/* Parent without children - render as simple paper */
										<Paper variant="outlined" sx={{ p: 2 }}>
											<Box display="flex" justifyContent="space-between" alignItems="center">
												<Box display="flex" alignItems="center" gap={2}>
													<Typography variant="subtitle1" fontWeight="medium">
														{category.name}
													</Typography>
													<Chip
														label={`${category.transaction_count} transactions`}
														size="small"
														variant="outlined"
													/>
													{category.is_automatic_deduction && (
														<Chip label="Auto" size="small" color="secondary" />
													)}
													{!category.allow_auto_learning && (
														<Tooltip title="Auto-learning disabled">
															<Chip label="No Learning" size="small" color="warning" />
														</Tooltip>
													)}
												</Box>
												<Box>
													{type === CategoryType.SAVING && (
														<Tooltip title="Manage account mappings">
															<IconButton onClick={() => handleOpenSavingsMapping(category)} size="small">
																<AccountBalance />
															</IconButton>
														</Tooltip>
													)}
													<IconButton onClick={() => handleOpen(category)} size="small">
														<Edit />
													</IconButton>
													<IconButton
														onClick={() => handleDelete(category)}
														size="small"
														color="error">
														<Delete />
													</IconButton>
												</Box>
											</Box>
										</Paper>
									)}
								</Box>
							);
						})}

						{/* Standalone categories (no parent) */}
						{childCategories.filter(cat => !parentCategories.find(parent => parent.id === cat.parent_category_id)).map((category) => (
							<Paper key={category.id} variant="outlined" sx={{ p: 2, mb: 1 }}>
								<Box display="flex" justifyContent="space-between" alignItems="center">
									<Box display="flex" alignItems="center" gap={2}>
										<Typography variant="body1">{category.name}</Typography>
										<Chip
											label={`${category.transaction_count} transactions`}
											size="small"
											variant="outlined"
										/>
										{category.is_automatic_deduction && (
											<Chip label="Auto" size="small" color="secondary" />
										)}
										{!category.allow_auto_learning && (
											<Chip label="No Learning" size="small" color="warning" />
										)}
									</Box>
									<Box>
										{type === CategoryType.SAVING && (
											<Tooltip title="Manage account mappings">
												<IconButton onClick={() => handleOpenSavingsMapping(category)} size="small">
													<AccountBalance />
												</IconButton>
											</Tooltip>
										)}
										<IconButton onClick={() => handleOpen(category)} size="small">
											<Edit />
										</IconButton>
										<IconButton onClick={() => handleDelete(category)} size="small" color="error">
											<Delete />
										</IconButton>
									</Box>
								</Box>
							</Paper>
						))}

						{categories.length === 0 && (
							<Alert severity="info">
								<Typography variant="body2" gutterBottom>
									No {title.toLowerCase()} categories yet.
								</Typography>
								{type === CategoryType.MANUAL_REVIEW && (
									<Typography variant="body2" paragraph>
										<strong>Create Manual Review categories for:</strong>
									</Typography>
								)}
								{type === CategoryType.MANUAL_REVIEW && (
									<Box component="ul" sx={{ pl: 2, mt: 0, mb: 1 }}>
										<Typography component="li" variant="body2">
											TWINT payments (vendor doesn't indicate expense type)
										</Typography>
										<Typography component="li" variant="body2">
											ATM withdrawals and cash transactions
										</Typography>
										<Typography component="li" variant="body2">
											Unknown bank transfers
										</Typography>
										<Typography component="li" variant="body2">
											Payment apps (PayPal, Venmo, etc.)
										</Typography>
									</Box>
								)}
								<Button
									size="small"
									variant="contained"
									color="warning"
									startIcon={<RateReview />}
									onClick={() => setManualReviewGuideOpen(true)}
									sx={{ mt: 1 }}>
									Create Manual Review Category
								</Button>
							</Alert>
						)}
					</Box>
				</AccordionDetails>
			</Accordion>
		);
	};

	if (isLoading) {
		return <Typography>Loading categories...</Typography>;
	}

	return (
		<Box>
			<Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
				<Box display="flex" alignItems="center" gap={2}>
					<Psychology color="primary" />
					<Typography variant="h4">Category Management</Typography>
				</Box>
				<Box display="flex" gap={2}>
					<Button variant="outlined" startIcon={<Add />} onClick={() => handleOpen()}>
						Add Category
					</Button>
					{getTotalCategories() === 0 && (
						<Button
							variant="contained"
							onClick={() => initDefaultsMutation.mutate()}
							disabled={initDefaultsMutation.isPending}>
							Initialize Defaults
						</Button>
					)}
				</Box>
			</Box>

			{/* Info Alert */}
			<Alert severity="info" sx={{ mb: 3 }}>
				<Typography variant="body2">
					<strong>Organize your transactions with hierarchical categories:</strong>
				</Typography>
				<Box component="ul" sx={{ mt: 1, mb: 0 }}>
					<Typography component="li" variant="body2">
						<strong>Income:</strong> Salary, freelance, investments, etc.
					</Typography>
					<Typography component="li" variant="body2">
						<strong>Expense:</strong> Bills, shopping, dining, etc.
					</Typography>
					<Typography component="li" variant="body2">
						<strong>Saving:</strong> Different savings goals
					</Typography>
					<Typography component="li" variant="body2">
						<strong>Manual Review:</strong> Generic vendors (like TWINT) that require human classification
					</Typography>
				</Box>
			</Alert>

			{/* Summary Cards */}
			<Grid container spacing={3} sx={{ mb: 3 }}>
				<Grid item xs={12} md={2.4}>
					<Card>
						<CardContent>
							<Box display="flex" alignItems="center" gap={1} mb={1}>
								<AccountBalance color="success" />
								<Typography color="textSecondary" gutterBottom>
									Income Categories
								</Typography>
							</Box>
							<Typography variant="h4">{hierarchy?.income?.length || 0}</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid item xs={12} md={2.4}>
					<Card>
						<CardContent>
							<Box display="flex" alignItems="center" gap={1} mb={1}>
								<TrendingDown color="error" />
								<Typography color="textSecondary" gutterBottom>
									Expense Categories
								</Typography>
							</Box>
							<Typography variant="h4">{hierarchy?.expense?.length || 0}</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid item xs={12} md={2.4}>
					<Card>
						<CardContent>
							<Box display="flex" alignItems="center" gap={1} mb={1}>
								<Savings color="primary" />
								<Typography color="textSecondary" gutterBottom>
									Saving Goals
								</Typography>
							</Box>
							<Typography variant="h4">{hierarchy?.saving?.length || 0}</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid item xs={12} md={2.4}>
					<Card>
						<CardContent>
							<Box display="flex" alignItems="center" gap={1} mb={1}>
								<SwapHoriz color="info" />
								<Typography color="textSecondary" gutterBottom>
									Transfer Categories
								</Typography>
							</Box>
							<Typography variant="h4">{hierarchy?.transfer?.length || 0}</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid item xs={12} md={2.4}>
					<Card>
						<CardContent>
							<Box display="flex" alignItems="center" gap={1} mb={1}>
								<RateReview color="warning" />
								<Typography color="textSecondary" gutterBottom>
									Manual Review
								</Typography>
							</Box>
							<Typography variant="h4">{hierarchy?.manual_review.length || 0}</Typography>
						</CardContent>
					</Card>
				</Grid>
			</Grid>

			{/* Category Sections */}
			<Box sx={{ mb: 3 }}>
				{hierarchy && (
					<>
						{renderCategorySection(
							'Income Categories',
							hierarchy.income,
							CategoryType.INCOME,
							categoryTypeIcons[CategoryType.INCOME]
						)}
						{renderCategorySection(
							'Expense Categories',
							hierarchy.expense,
							CategoryType.EXPENSE,
							categoryTypeIcons[CategoryType.EXPENSE]
						)}
						{renderCategorySection(
							'Saving Categories',
							hierarchy.saving,
							CategoryType.SAVING,
							categoryTypeIcons[CategoryType.SAVING]
						)}
						{renderCategorySection(
							'Transfer Categories',
							hierarchy.transfer || [],
							CategoryType.TRANSFER,
							categoryTypeIcons[CategoryType.TRANSFER]
						)}
						{renderCategorySection(
							'Manual Review Categories',
							hierarchy.manual_review,
							CategoryType.MANUAL_REVIEW,
							categoryTypeIcons[CategoryType.MANUAL_REVIEW]
						)}
					</>
				)}
			</Box>

			{/* Manual Review Guide Dialog */}
			<Dialog open={manualReviewGuideOpen} onClose={() => setManualReviewGuideOpen(false)} maxWidth="md" fullWidth>
				<DialogTitle>
					<Box display="flex" alignItems="center" gap={2}>
						<RateReview color="warning" />
						<Typography variant="h6">Create Manual Review Category</Typography>
					</Box>
				</DialogTitle>
				<DialogContent>
					<Alert severity="info" sx={{ mb: 3 }}>
						<Box display="flex" alignItems="center" gap={1} mb={1}>
							<Psychology />
							<Typography variant="subtitle2" fontWeight="bold">
								When to use Manual Review categories
							</Typography>
						</Box>
						<Typography variant="body2">
							Create these categories for vendors where the vendor name alone doesn't tell you
							what type of expense it is. This prevents the system from incorrectly auto-categorizing
							future transactions from these generic vendors.
						</Typography>
					</Alert>

					{/* Quick Create Buttons */}
					<Typography variant="h6" gutterBottom>
						Common Manual Review Categories
					</Typography>
					<Grid container spacing={2} sx={{ mb: 3 }}>
						{[
							{ name: 'TWINT Payments', description: 'Mobile payments for various merchants' },
							{ name: 'ATM Withdrawals', description: 'Cash withdrawals for various purposes' },
							{ name: 'Unknown Bank Transfers', description: 'Generic transfers and bill payments' },
							{ name: 'PayPal Payments', description: 'Online payments through PayPal' },
							{ name: 'Apple Pay', description: 'Contactless payments via Apple Pay' },
							{ name: 'Google Pay', description: 'Contactless payments via Google Pay' },
						].map((category, index) => (
							<Grid item xs={12} md={6} key={index}>
								<Card variant="outlined" sx={{ height: '100%' }}>
									<CardContent>
										<Box display="flex" justifyContent="between" alignItems="flex-start" mb={1}>
											<Typography variant="subtitle2" fontWeight="medium" gutterBottom>
												{category.name}
											</Typography>
										</Box>
										<Typography variant="body2" color="textSecondary" paragraph sx={{ mb: 2 }}>
											{category.description}
										</Typography>
										<Button
											size="small"
											variant="outlined"
											fullWidth
											onClick={() => handleCreateManualReviewCategory(category.name)}>
											Create "{category.name}" Category
										</Button>
									</CardContent>
								</Card>
							</Grid>
						))}
					</Grid>

					{/* Custom Category Creation */}
					<Typography variant="h6" gutterBottom>
						Create Custom Category
					</Typography>
					<Box display="flex" gap={2} alignItems="flex-end">
						<TextField
							fullWidth
							label="Category Name"
							placeholder="e.g., Venmo Payments, Square Payments"
							helperText="Name should describe the payment method or generic vendor"
							onKeyPress={(e) => {
								if (e.key === 'Enter') {
									const target = e.target as HTMLInputElement;
									if (target.value.trim()) {
										handleCreateManualReviewCategory(target.value.trim());
										target.value = '';
									}
								}
							}}
						/>
						<Button
							variant="contained"
							color="warning"
							onClick={(e) => {
								const input = e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement;
								if (input?.value.trim()) {
									handleCreateManualReviewCategory(input.value.trim());
									input.value = '';
								}
							}}>
							Create
						</Button>
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setManualReviewGuideOpen(false)}>Close</Button>
				</DialogActions>
			</Dialog>

			{/* Category Form Dialog */}
			<Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
				<DialogTitle>
					{editingCategory ? 'Edit Category' : 'Add Category'}
				</DialogTitle>
				<DialogContent>
					<Box sx={{ pt: 2 }}>
						<Grid container spacing={2}>
							<Grid item xs={12} md={6}>
								<TextField
									fullWidth
									label="Category Name"
									value={formData.name}
									onChange={(e) => setFormData({ ...formData, name: e.target.value })}
									margin="normal"
									required
									placeholder={`e.g., ${getExampleCategories(formData.category_type)[0]}`}
									helperText={`Examples: ${getExampleCategories(formData.category_type).slice(0, 2).join(', ')}`}
								/>
							</Grid>
							<Grid item xs={12} md={6}>
								<FormControl fullWidth margin="normal" required>
									<InputLabel>Category Type</InputLabel>
									<Select
										value={formData.category_type}
										label="Category Type"
										onChange={(e) =>
											setFormData({
												...formData,
												category_type: e.target.value as CategoryType,
												// Reset parent when changing type
												parent_category_id: '',
												// Auto-disable learning for Manual Review
												allow_auto_learning: e.target.value !== CategoryType.MANUAL_REVIEW
											})
										}>
										{Object.entries(categoryTypeLabels).map(([value, label]) => (
											<MenuItem key={value} value={value}>
												<Box display="flex" alignItems="center" gap={1}>
													{categoryTypeIcons[value as CategoryType]}
													{label}
												</Box>
											</MenuItem>
										))}
									</Select>
								</FormControl>
							</Grid>
						</Grid>

						{/* Type-specific help text */}
						<Alert severity="info" sx={{ mt: 1, mb: 2 }}>
							<Typography variant="body2">
								{formData.category_type === CategoryType.INCOME && (
									"💰 Income categories track money coming into your accounts (salary, freelance, investments, etc.)"
								)}
								{formData.category_type === CategoryType.EXPENSE && (
									"💸 Expense categories track money spent on goods and services (groceries, utilities, entertainment, etc.)"
								)}
								{formData.category_type === CategoryType.SAVING && (
									"🏦 Saving categories track money set aside for specific goals (emergency fund, vacation, retirement, etc.)"
								)}
								{formData.category_type === CategoryType.MANUAL_REVIEW && (
									"🔍 Manual Review categories are for generic vendors that require human classification (TWINT, ATM, unknown bank transfers, etc.)"
								)}
								{formData.category_type === CategoryType.TRANSFER && (
									"↔️ Transfer categories facilitate account transfers and money movement between accounts"
								)}
							</Typography>
						</Alert>

						{/* Parent Category Selection */}
						<FormControl fullWidth margin="normal">
							<InputLabel>Parent Category (Optional)</InputLabel>
							<Select
								value={formData.parent_category_id}
								label="Parent Category (Optional)"
								onChange={(e) => setFormData({ ...formData, parent_category_id: e.target.value })}>
								<MenuItem value="">
									<em>None (Top-level category)</em>
								</MenuItem>
								{getPotentialParents(formData.category_type).map((parent) => (
									<MenuItem key={parent.id} value={parent.id}>
										{parent.name}
									</MenuItem>
								))}
							</Select>
						</FormControl>

						{/* Category Options */}
						<Box sx={{ mt: 2 }}>
							<FormControlLabel
								control={
									<Checkbox
										checked={formData.is_automatic_deduction}
										onChange={(e) => setFormData({ ...formData, is_automatic_deduction: e.target.checked })}
									/>
								}
								label="Automatic Deduction (e.g., Salary, Recurring Bills)"
							/>

							<FormControlLabel
								control={
									<Checkbox
										checked={formData.allow_auto_learning}
										onChange={(e) => setFormData({ ...formData, allow_auto_learning: e.target.checked })}
										disabled={formData.category_type === CategoryType.MANUAL_REVIEW}
									/>
								}
								label="Allow Auto-Learning (System can learn vendor patterns)"
							/>
						</Box>

						{/* Manual Review Warning and Examples */}
						{formData.category_type === CategoryType.MANUAL_REVIEW && (
							<Alert severity="warning" sx={{ mt: 2 }}>
								<Box>
									<Box display="flex" alignItems="center" gap={1} mb={1}>
										<Warning />
										<Typography variant="subtitle2" fontWeight="bold">
											Manual Review Category
										</Typography>
									</Box>
									<Typography variant="body2" paragraph>
										Manual Review categories are designed for generic vendors where the vendor name alone
										doesn't indicate the expense type. These categories automatically disable auto-learning
										to prevent incorrect pattern matching.
									</Typography>
									<Typography variant="body2" fontWeight="bold" gutterBottom>
										Perfect for:
									</Typography>
									<Box component="ul" sx={{ pl: 2, mt: 0, mb: 1 }}>
										<Typography component="li" variant="body2">
											<strong>TWINT Payments</strong> - Could be groceries, restaurants, or shopping
										</Typography>
										<Typography component="li" variant="body2">
											<strong>ATM Withdrawals</strong> - Cash for various purposes
										</Typography>
										<Typography component="li" variant="body2">
											<strong>Unknown Bank Transfers</strong> - Generic transfers between accounts
										</Typography>
										<Typography component="li" variant="body2">
											<strong>Generic Payment Apps</strong> - PayPal, Venmo, etc.
										</Typography>
									</Box>
									<Typography variant="body2">
										💡 <strong>Tip:</strong> After categorizing transactions from these vendors,
										you can manually recategorize them to more specific expense categories.
									</Typography>
								</Box>
							</Alert>
						)}

						{/* Auto-Learning Info for other types */}
						{formData.allow_auto_learning && formData.category_type !== CategoryType.MANUAL_REVIEW && (
							<Alert severity="info" sx={{ mt: 2 }}>
								<Box display="flex" alignItems="center" gap={1}>
									<Psychology />
									<Typography variant="body2">
										<strong>Smart Learning Enabled:</strong> When you categorize transactions to this category,
										the system will learn vendor patterns and automatically categorize similar transactions in the future.
									</Typography>
								</Box>
							</Alert>
						)}
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleClose}>Cancel</Button>
					<Button
						onClick={handleSubmit}
						variant="contained"
						disabled={!formData.name || createMutation.isPending || updateMutation.isPending}>
						{editingCategory ? 'Update' : 'Create'}
					</Button>
				</DialogActions>
			</Dialog>

			{/* Savings Account Mapping Dialog */}
			<SavingsAccountMappingDialog
				open={savingsMapOpen}
				onClose={handleCloseSavingsMapping}
				categoryId={selectedSavingsCategory?.id}
				categoryName={selectedSavingsCategory?.name}
			/>
		</Box>
	);
}
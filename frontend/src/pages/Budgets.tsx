import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
	Box,
	Paper,
	Typography,
	Grid,
	Card,
	CardContent,
	TextField,
	Button,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	LinearProgress,
	Chip,
	Alert,
	IconButton,
	Tooltip,
	Tabs,
	Tab,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Fab,
	Divider,
	Stack,
	FormControl,
	InputLabel,
	InputAdornment,
	OutlinedInput,
	Accordion,
	AccordionSummary,
	AccordionDetails,
	CircularProgress,
} from '@mui/material';
import {
	ChevronLeft,
	ChevronRight,
	Save,
	Compare,
	History,
	TrendingUp,
	TrendingDown,
	AccountBalance,
	Category,
	Add,
	AttachMoney,
	CalendarMonth,
	Analytics,
	ExpandMore,
	Savings,
	Refresh,
	ContentCopy,
	FileCopy,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format, startOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

// Chart components
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip as RechartsTooltip,
	ResponsiveContainer,
	BarChart,
	Bar,
	PieChart,
	Pie,
	Cell,
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d'];

interface TabPanelProps {
	children?: React.ReactNode;
	index: number;
	value: number;
}

function TabPanel(props: TabPanelProps) {
	const { children, value, index, ...other } = props;
	return (
		<div
			role="tabpanel"
			hidden={value !== index}
			id={`budget-tabpanel-${index}`}
			aria-labelledby={`budget-tab-${index}`}
			{...other}
		>
			{value === index && <Box sx={{ py: 3 }}>{children}</Box>}
		</div>
	);
}

export default function Budgets() {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const navigate = useNavigate();

	// State management
	const [currentPeriod, setCurrentPeriod] = useState(startOfMonth(new Date()));
	const [budgetAmounts, setBudgetAmounts] = useState<Record<string, string>>({});
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [tabValue, setTabValue] = useState(0);
	const [compareDialogOpen, setCompareDialogOpen] = useState(false);
	const [comparePeriod, setComparePeriod] = useState(startOfMonth(subMonths(new Date(), 1)));
	const [copyDialogOpen, setCopyDialogOpen] = useState(false);
	const [copyFromPeriod, setCopyFromPeriod] = useState(startOfMonth(subMonths(new Date(), 1)));

	// API queries
	const { data: budget, isLoading: budgetLoading, refetch: refetchBudget } = useQuery({
		queryKey: ['budget', currentPeriod.toISOString()],
		queryFn: async () => {
			// Use local date formatting to avoid timezone issues
			const year = currentPeriod.getFullYear();
			const month = String(currentPeriod.getMonth() + 1).padStart(2, '0');
			const day = String(currentPeriod.getDate()).padStart(2, '0');
			const dateString = `${year}-${month}-${day}`;

			const response = await apiClient.getBudgetForPeriod(dateString);
			// Debug logging to see what data we're receiving
			console.log('🔍 FRONTEND: Budget API response for period', dateString, ':', response.data);
			console.log('🔍 FRONTEND: total_spent =', response.data?.total_spent);
			console.log('🔍 FRONTEND: total_budgeted =', response.data?.total_budgeted);
			return response.data;
		},
	});

	const { data: groupedBudget, isLoading: groupedBudgetLoading } = useQuery({
		queryKey: ['groupedBudget', currentPeriod.toISOString()],
		queryFn: async () => {
			// Use local date formatting to avoid timezone issues
			const year = currentPeriod.getFullYear();
			const month = String(currentPeriod.getMonth() + 1).padStart(2, '0');
			const day = String(currentPeriod.getDate()).padStart(2, '0');
			const dateString = `${year}-${month}-${day}`;

			const response = await apiClient.getBudgetForPeriodGrouped(dateString);
			return response.data;
		},
	});

	const { data: categories, isLoading: categoriesLoading } = useQuery({
		queryKey: ['categories'],
		queryFn: async () => {
			const response = await apiClient.getCategories();
			return response.data;
		},
	});

	const { data: budgetHistory } = useQuery({
		queryKey: ['budgetHistory'],
		queryFn: async () => {
			const response = await apiClient.getBudgetHistory(12);
			return response.data;
		},
	});

	const { data: budgetComparison } = useQuery({
		queryKey: ['budgetComparison', currentPeriod.toISOString(), comparePeriod.toISOString()],
		queryFn: async () => {
			// Use local date formatting for both periods to avoid timezone issues
			const currentYear = currentPeriod.getFullYear();
			const currentMonth = String(currentPeriod.getMonth() + 1).padStart(2, '0');
			const currentDay = String(currentPeriod.getDate()).padStart(2, '0');
			const currentDateString = `${currentYear}-${currentMonth}-${currentDay}`;

			const compareYear = comparePeriod.getFullYear();
			const compareMonth = String(comparePeriod.getMonth() + 1).padStart(2, '0');
			const compareDay = String(comparePeriod.getDate()).padStart(2, '0');
			const compareDateString = `${compareYear}-${compareMonth}-${compareDay}`;

			const response = await apiClient.getBudgetComparison(
				currentDateString,
				compareDateString
			);
			return response.data;
		},
		enabled: compareDialogOpen,
	});

	const { data: copyFromBudget } = useQuery({
		queryKey: ['copyFromBudget', copyFromPeriod.toISOString()],
		queryFn: async () => {
			// Use local date formatting to avoid timezone issues
			const year = copyFromPeriod.getFullYear();
			const month = String(copyFromPeriod.getMonth() + 1).padStart(2, '0');
			const day = String(copyFromPeriod.getDate()).padStart(2, '0');
			const dateString = `${year}-${month}-${day}`;

			const response = await apiClient.getBudgetForPeriod(dateString);
			return response.data;
		},
		enabled: copyDialogOpen,
	});

	// Mutations
	const bulkUpdateMutation = useMutation({
		mutationFn: async (updates: Array<{ category_id: string, amount: number }>) => {
			// Use local date formatting to avoid timezone issues
			const year = currentPeriod.getFullYear();
			const month = String(currentPeriod.getMonth() + 1).padStart(2, '0');
			const day = String(currentPeriod.getDate()).padStart(2, '0');
			const dateString = `${year}-${month}-${day}`;

			return apiClient.bulkUpdateBudget(
				dateString,
				updates
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['budget'] });
			queryClient.invalidateQueries({ queryKey: ['groupedBudget'] });
			queryClient.invalidateQueries({ queryKey: ['budgetHistory'] });
			queryClient.invalidateQueries({ queryKey: ['dailyAllowances'] });
			setHasUnsavedChanges(false);
			enqueueSnackbar('Budget updated successfully', { variant: 'success' });
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Failed to update budget', { variant: 'error' });
		},
	});

	const copyBudgetMutation = useMutation({
		mutationFn: async ({ fromPeriod, toPeriod }: { fromPeriod: Date, toPeriod: Date }) => {
			// Use local date formatting to avoid timezone issues
			const fromYear = fromPeriod.getFullYear();
			const fromMonth = String(fromPeriod.getMonth() + 1).padStart(2, '0');
			const fromDay = String(fromPeriod.getDate()).padStart(2, '0');
			const fromDateString = `${fromYear}-${fromMonth}-${fromDay}`;

			const toYear = toPeriod.getFullYear();
			const toMonth = String(toPeriod.getMonth() + 1).padStart(2, '0');
			const toDay = String(toPeriod.getDate()).padStart(2, '0');
			const toDateString = `${toYear}-${toMonth}-${toDay}`;

			return apiClient.copyBudget(fromDateString, toDateString);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['budget'] });
			queryClient.invalidateQueries({ queryKey: ['groupedBudget'] });
			queryClient.invalidateQueries({ queryKey: ['budgetHistory'] });
			setCopyDialogOpen(false);
			enqueueSnackbar('Budget copied successfully', { variant: 'success' });
		},
		onError: (error: any) => {
			enqueueSnackbar(error.response?.data?.detail || 'Failed to copy budget', { variant: 'error' });
		},
	});

	// Effects
	useEffect(() => {
		if (budget?.categories) {
			const newBudgetAmounts: Record<string, string> = {};
			budget.categories.forEach((cat: any) => {
				newBudgetAmounts[cat.category_id] = cat.budgeted.toString();
			});
			setBudgetAmounts(newBudgetAmounts);
			setHasUnsavedChanges(false);
		}
	}, [budget]);

	// Also initialize from grouped budget data
	useEffect(() => {
		if (groupedBudget?.groups && !budget?.categories) {
			const newBudgetAmounts: Record<string, string> = {};
			groupedBudget.groups.forEach((group: any) => {
				// Add parent category budget if exists
				if (group.budgeted !== undefined) {
					newBudgetAmounts[group.category_id] = group.budgeted.toString();
				}
				// Add child categories
				group.children?.forEach((child: any) => {
					newBudgetAmounts[child.category_id] = child.budgeted.toString();
				});
			});
			setBudgetAmounts(newBudgetAmounts);
			setHasUnsavedChanges(false);
		}
	}, [groupedBudget, budget]);

	// Handlers
	const handlePeriodChange = (direction: 'prev' | 'next') => {
		if (hasUnsavedChanges) {
			const confirmed = window.confirm('You have unsaved changes. Are you sure you want to navigate away?');
			if (!confirmed) return;
		}

		if (direction === 'prev') {
			setCurrentPeriod(subMonths(currentPeriod, 1));
		} else {
			setCurrentPeriod(addMonths(currentPeriod, 1));
		}
	};

	const handleAmountChange = (categoryId: string, value: string) => {
		// Allow empty string or valid numbers
		if (value === '' || (/^\d*\.?\d*$/.test(value) && parseFloat(value) >= 0)) {
			setBudgetAmounts(prev => ({ ...prev, [categoryId]: value }));
			setHasUnsavedChanges(true);
		}
	};

	const handleBulkSave = () => {
		const updates = Object.entries(budgetAmounts)
			.filter(([_, amount]) => amount && parseFloat(amount) >= 0)
			.map(([categoryId, amount]) => ({
				category_id: categoryId,
				amount: parseFloat(amount) || 0
			}));

		if (updates.length === 0) {
			enqueueSnackbar('No valid budget amounts to save', { variant: 'warning' });
			return;
		}

		bulkUpdateMutation.mutate(updates);
	};

	const handleCopyBudget = () => {
		if (hasUnsavedChanges) {
			const confirmed = window.confirm('You have unsaved changes. Copying a budget will overwrite your current changes. Continue?');
			if (!confirmed) return;
		}

		copyBudgetMutation.mutate({
			fromPeriod: copyFromPeriod,
			toPeriod: currentPeriod
		});
	};

	const getCurrentPeriodLabel = () => {
		const isCurrentMonth = isSameMonth(currentPeriod, new Date());
		const label = format(currentPeriod, 'MMMM yyyy');
		return isCurrentMonth ? `${label} (Current)` : label;
	};

	const calculateTotals = () => {
		if (!budget?.categories) return { totalBudgeted: 0, totalSpent: 0, remaining: 0 };

		// Only include expense and savings categories in budget totals (exclude income and manual review)
		// This matches the backend logic in budget.py
		const budgetableCategories = budget.categories.filter((cat: any) =>
			cat.category_type === 'EXPENSE' || cat.category_type === 'SAVING'
		);

		const totalBudgeted = budgetableCategories.reduce((sum: number, cat: any) => sum + cat.budgeted, 0);
		const totalSpent = budgetableCategories.reduce((sum: number, cat: any) => sum + cat.spent, 0);
		const remaining = totalBudgeted - totalSpent;

		// Debug logging to trace calculation
		const year = currentPeriod.getFullYear();
		const month = String(currentPeriod.getMonth() + 1).padStart(2, '0');
		const day = String(currentPeriod.getDate()).padStart(2, '0');
		const dateString = `${year}-${month}-${day}`;

		console.log('🧮 FRONTEND: calculateTotals() for period', dateString);
		console.log('🧮 FRONTEND: budget.total_spent =', budget.total_spent);
		console.log('🧮 FRONTEND: budget.total_budgeted =', budget.total_budgeted);
		console.log('🧮 FRONTEND: budgetableCategories count =', budgetableCategories.length);
		console.log('🧮 FRONTEND: budgetableCategories =', budgetableCategories.map(cat => `${cat.category_name} (${cat.category_type}): $${cat.spent}`));
		console.log('🧮 FRONTEND: calculated totalSpent =', totalSpent);
		console.log('🧮 FRONTEND: calculated totalBudgeted =', totalBudgeted);

		// Show excluded categories for transparency
		const excludedCategories = budget.categories.filter((cat: any) =>
			cat.category_type === 'INCOME' || cat.category_type === 'MANUAL_REVIEW'
		);
		if (excludedCategories.length > 0) {
			console.log('❌ FRONTEND: excludedCategories =', excludedCategories.map(cat => `${cat.category_name} (${cat.category_type}): $${cat.spent}`));
		}

		return { totalBudgeted, totalSpent, remaining };
	};

	const getProgressColor = (percentage: number) => {
		if (percentage > 100) return 'error';
		if (percentage > 80) return 'warning';
		return 'primary';
	};

	const renderBudgetTable = () => {
		if (groupedBudgetLoading) {
			return (
				<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
					<CircularProgress />
				</Box>
			);
		}

		if (!groupedBudget?.groups) {
			return renderFallbackBudgetTable();
		}

		return (
			<Box>
				{/* Income Allocation Summary */}
				{groupedBudget.summary && (
					<Paper sx={{ p: 3, mb: 3, bgcolor: 'background.default' }}>
						<Typography variant="h6" gutterBottom>
							Income Allocation Overview
						</Typography>
						<Grid container spacing={3}>
							<Grid item xs={12} md={3}>
								<Box>
									<Typography variant="body2" color="textSecondary">Total Income Budgeted</Typography>
									<Typography variant="h6" color="success.main">
										${groupedBudget.summary.total_income_budgeted.toFixed(2)}
									</Typography>
								</Box>
							</Grid>
							<Grid item xs={12} md={3}>
								<Box>
									<Typography variant="body2" color="textSecondary">Total Expenses Budgeted</Typography>
									<Typography variant="h6" color="error.main">
										${groupedBudget.summary.total_expense_budgeted.toFixed(2)}
									</Typography>
								</Box>
							</Grid>
							<Grid item xs={12} md={3}>
								<Box>
									<Typography variant="body2" color="textSecondary">Total Savings Budgeted</Typography>
									<Typography variant="h6" color="info.main">
										${groupedBudget.summary.total_savings_budgeted.toFixed(2)}
									</Typography>
								</Box>
							</Grid>
							<Grid item xs={12} md={3}>
								<Box>
									<Typography variant="body2" color="textSecondary">Unallocated Income</Typography>
									<Typography
										variant="h6"
										color={groupedBudget.summary.unallocated_income < 0 ? 'error.main' : 'success.main'}
									>
										${groupedBudget.summary.unallocated_income.toFixed(2)}
									</Typography>
								</Box>
							</Grid>
						</Grid>
					</Paper>
				)}

				{/* Prominent Unallocated Income Notice */}
				{groupedBudget.summary && groupedBudget.summary.unallocated_income !== 0 && (
					<Alert
						severity={groupedBudget.summary.unallocated_income < 0 ? 'error' : 'warning'}
						sx={{ mb: 3 }}
					>
						<Typography variant="body1" fontWeight="medium">
							{groupedBudget.summary.unallocated_income < 0
								? `You have over-allocated by $${Math.abs(groupedBudget.summary.unallocated_income).toFixed(2)}`
								: `You have $${groupedBudget.summary.unallocated_income.toFixed(2)} left to allocate`
							}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{groupedBudget.summary.unallocated_income < 0
								? 'Your total expenses and savings exceed your budgeted income. Consider reducing some budgets or increasing income.'
								: 'Consider allocating this remaining income to expenses or savings goals.'
							}
						</Typography>
					</Alert>
				)}

				{/* Grouped Budget Categories */}
				{groupedBudget.groups.map((group: any) => (
					<Accordion key={group.category_id} defaultExpanded sx={{ mb: 2 }}>
						<AccordionSummary expandIcon={<ExpandMore />}>
							<Box sx={{ display: 'flex', alignItems: 'center', width: '100%', pr: 2 }}>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
									{group.category_type === 'INCOME' && <TrendingUp color="success" />}
									{group.category_type === 'EXPENSE' && <TrendingDown color="error" />}
									{group.category_type === 'SAVING' && <Savings color="info" />}
									<Typography variant="h6">{group.category_name}</Typography>
									<Chip
										label={group.category_type}
										size="small"
										color={
											group.category_type === 'INCOME' ? 'success' :
												group.category_type === 'EXPENSE' ? 'error' : 'info'
										}
									/>
									{group.total_transaction_count !== undefined && (
										<Chip
											label={`${group.total_transaction_count} transactions`}
											size="small"
											variant="outlined"
											color="default"
										/>
									)}
								</Box>
								<Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
									<Box sx={{ textAlign: 'right' }}>
										<Typography variant="body2" color="textSecondary">Budgeted</Typography>
										<Typography variant="h6">${group.total_budgeted.toFixed(2)}</Typography>
									</Box>
									<Box sx={{ textAlign: 'right' }}>
										<Typography variant="body2" color="textSecondary">Actual</Typography>
										<Typography variant="h6">${group.total_actual.toFixed(2)}</Typography>
									</Box>
								</Box>
							</Box>
						</AccordionSummary>
						<AccordionDetails>
							<TableContainer>
								<Table>
									<TableHead>
										<TableRow>
											<TableCell>Category</TableCell>
											<TableCell align="right">Budgeted</TableCell>
											<TableCell align="right">{group.category_type === 'INCOME' ? 'Earned' : 'Spent'}</TableCell>
											<TableCell align="right">Remaining</TableCell>
											<TableCell align="center">Progress</TableCell>
											{group.category_type !== 'INCOME' && (
												<TableCell align="right">Daily Allowance</TableCell>
											)}
										</TableRow>
									</TableHead>
									<TableBody>
										{/* Parent category - show summary if has children, otherwise show normal row */}
										{group.children && group.children.length > 0 ? (
											(() => {
												// Calculate totals from children
												const totalBudgeted = group.children.reduce((sum: number, child: any) => sum + (child.budgeted || 0), 0);
												const totalSpent = group.children.reduce((sum: number, child: any) => sum + (child.spent || 0), 0);
												const totalRemaining = totalBudgeted - totalSpent;
												const totalPercentageUsed = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
												const totalDailyAllowance = group.children.reduce((sum: number, child: any) => sum + (child.daily_allowance || 0), 0);
												const isOverBudget = totalRemaining < 0;

												return (
													/* Parent with children - show summary only */
													<TableRow>
														<TableCell>
															<Box display="flex" alignItems="center" gap={1}>
																<Category color="primary" fontSize="small" />
																<Typography fontWeight="bold">{group.category_name}</Typography>
																<Chip
																	label={`${group.children?.length || 0} subcategories`}
																	size="small"
																	color="primary"
																	variant="outlined"
																/>
																{isOverBudget && (
																	<Chip label="Over Budget" color="error" size="small" />
																)}
															</Box>
														</TableCell>
														<TableCell align="right">
															<Typography variant="body2" color="text.secondary">
																${totalBudgeted.toFixed(2)}
															</Typography>
															<Typography variant="caption" display="block" color="text.secondary">
																(across {group.children?.length || 0} subcategories)
															</Typography>
														</TableCell>
														<TableCell align="right">
															<Typography color={isOverBudget ? 'error' : 'inherit'}>
																${totalSpent.toFixed(2)}
															</Typography>
														</TableCell>
														<TableCell align="right">
															<Typography color={totalRemaining < 0 ? 'error' : 'success.main'}>
																${totalRemaining.toFixed(2)}
															</Typography>
														</TableCell>
														<TableCell align="center">
															<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
																<LinearProgress
																	variant="determinate"
																	value={Math.min(totalPercentageUsed, 100)}
																	color={getProgressColor(totalPercentageUsed)}
																	sx={{ width: 60, height: 8 }}
																/>
																<Typography variant="body2">
																	{totalPercentageUsed.toFixed(0)}%
																</Typography>
															</Box>
														</TableCell>
														{group.category_type !== 'INCOME' && (
															<TableCell align="right">
																<Typography variant="body2" color="success.main">
																	${totalDailyAllowance.toFixed(2)}
																</Typography>
															</TableCell>
														)}
													</TableRow>
												);
											})()
										) : (
											/* Parent without children - show normal editable row */
											group.budgeted !== undefined && (
												<TableRow>
													<TableCell>
														<Box display="flex" alignItems="center" gap={1}>
															<Category color="primary" fontSize="small" />
															<Typography fontWeight="bold">{group.category_name}</Typography>
															{group.is_over_budget && (
																<Chip label="Over Budget" color="error" size="small" />
															)}
														</Box>
													</TableCell>
													<TableCell align="right">
														<FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
															<OutlinedInput
																value={budgetAmounts[group.category_id] || ''}
																onChange={(e) => handleAmountChange(group.category_id, e.target.value)}
																startAdornment={<InputAdornment position="start">$</InputAdornment>}
																placeholder="0.00"
															/>
														</FormControl>
													</TableCell>
													<TableCell align="right">
														<Typography color={group.is_over_budget ? 'error' : 'inherit'}>
															${group.spent.toFixed(2)}
														</Typography>
													</TableCell>
													<TableCell align="right">
														<Typography color={group.remaining < 0 ? 'error' : 'success.main'}>
															${group.remaining.toFixed(2)}
														</Typography>
													</TableCell>
													<TableCell align="center">
														<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
															<LinearProgress
																variant="determinate"
																value={Math.min(group.percentage_used, 100)}
																color={getProgressColor(group.percentage_used)}
																sx={{ width: 60, height: 8 }}
															/>
															<Typography variant="body2">
																{group.percentage_used.toFixed(0)}%
															</Typography>
														</Box>
													</TableCell>
													{group.category_type !== 'INCOME' && (
														<TableCell align="right">
															<Typography variant="body2" color="success.main">
																${group.daily_allowance?.toFixed(2) || '0.00'}
															</Typography>
														</TableCell>
													)}
												</TableRow>
											)
										)}

										{/* Child categories - only show if parent category is collapsed */}
										{group.children && group.children.length > 0 && (
											<TableRow>
												<TableCell colSpan={group.category_type !== 'INCOME' ? 6 : 5}>
													<Accordion>
														<AccordionSummary expandIcon={<ExpandMore />}>
															<Typography variant="body2" color="text.secondary">
																View and edit {group.children?.length || 0} subcategories
															</Typography>
														</AccordionSummary>
														<AccordionDetails>
															<Table size="small">
																<TableBody>
																	{group.children.map((child: any) => (
																		<TableRow key={child.category_id}>
																			<TableCell>
																				<Box display="flex" alignItems="center" gap={1} sx={{ pl: 2 }}>
																					<Category color="action" fontSize="small" />
																					{child.category_name}
																					{child.is_over_budget && (
																						<Chip label="Over Budget" color="error" size="small" />
																					)}
																				</Box>
																			</TableCell>
																			<TableCell align="right">
																				<FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
																					<OutlinedInput
																						value={budgetAmounts[child.category_id] || ''}
																						onChange={(e) => handleAmountChange(child.category_id, e.target.value)}
																						startAdornment={<InputAdornment position="start">$</InputAdornment>}
																						placeholder="0.00"
																					/>
																				</FormControl>
																			</TableCell>
																			<TableCell align="right">
																				<Typography color={child.is_over_budget ? 'error' : 'inherit'}>
																					${(child.spent || 0).toFixed(2)}
																				</Typography>
																			</TableCell>
																			<TableCell align="right">
																				<Typography color={(child.remaining || 0) < 0 ? 'error' : 'success.main'}>
																					${(child.remaining || 0).toFixed(2)}
																				</Typography>
																			</TableCell>
																			<TableCell align="center">
																				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
																					<LinearProgress
																						variant="determinate"
																						value={Math.min((child.percentage_used || 0), 100)}
																						color={getProgressColor(child.percentage_used || 0)}
																						sx={{ width: 60, height: 8 }}
																					/>
																					<Typography variant="body2">
																						{(child.percentage_used || 0).toFixed(0)}%
																					</Typography>
																				</Box>
																			</TableCell>
																			{group.category_type !== 'INCOME' && (
																				<TableCell align="right">
																					<Typography variant="body2" color="success.main">
																						${(child.daily_allowance || 0).toFixed(2)}
																					</Typography>
																				</TableCell>
																			)}
																		</TableRow>
																	))}
																</TableBody>
															</Table>
														</AccordionDetails>
													</Accordion>
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</TableContainer>
						</AccordionDetails>
					</Accordion>
				))}

				{/* Save Actions */}
				{hasUnsavedChanges && (
					<Paper sx={{ p: 2, mt: 3, bgcolor: 'warning.light' }}>
						<Box display="flex" justifyContent="space-between" alignItems="center">
							<Typography variant="body1">
								You have unsaved changes
							</Typography>
							<Box display="flex" gap={2}>
								<Button
									variant="outlined"
									onClick={() => {
										if (budget?.categories) {
											const resetAmounts: Record<string, string> = {};
											budget.categories.forEach((cat: any) => {
												resetAmounts[cat.category_id] = cat.budgeted.toString();
											});
											setBudgetAmounts(resetAmounts);
											setHasUnsavedChanges(false);
										}
									}}
								>
									Reset Changes
								</Button>
								<Button
									variant="contained"
									onClick={handleBulkSave}
									disabled={bulkUpdateMutation.isPending}
								>
									{bulkUpdateMutation.isPending ? 'Saving...' : 'Save All Changes'}
								</Button>
							</Box>
						</Box>
					</Paper>
				)}
			</Box>
		);
	};

	const renderFallbackBudgetTable = () => {
		if (!budget?.categories) return null;

		const expenseCategories = budget.categories.filter((cat: any) => !cat.is_savings);
		const savingsCategories = budget.categories.filter((cat: any) => cat.is_savings);

		return (
			<Box>
				{/* Expense Categories */}
				{expenseCategories.length > 0 && (
					<>
						<Typography variant="h6" gutterBottom sx={{ mt: 2, mb: 1 }}>
							Expense Categories
						</Typography>
						<TableContainer component={Paper} sx={{ mb: 3 }}>
							<Table>
								<TableHead>
									<TableRow>
										<TableCell>Category</TableCell>
										<TableCell align="right">Budgeted</TableCell>
										<TableCell align="right">Spent</TableCell>
										<TableCell align="right">Remaining</TableCell>
										<TableCell align="center">Progress</TableCell>
										<TableCell align="right">Daily Allowance</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{expenseCategories.map((category: any) => (
										<TableRow key={category.category_id}>
											<TableCell>
												<Box display="flex" alignItems="center" gap={1}>
													<Category color="primary" fontSize="small" />
													{category.category_name}
													{category.is_over_budget && (
														<Chip label="Over Budget" color="error" size="small" />
													)}
												</Box>
											</TableCell>
											<TableCell align="right">
												<FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
													<OutlinedInput
														value={budgetAmounts[category.category_id] || ''}
														onChange={(e) => handleAmountChange(category.category_id, e.target.value)}
														startAdornment={<InputAdornment position="start">$</InputAdornment>}
														placeholder="0.00"
													/>
												</FormControl>
											</TableCell>
											<TableCell align="right">
												<Typography color={category.is_over_budget ? 'error' : 'inherit'}>
													${category.spent.toFixed(2)}
												</Typography>
											</TableCell>
											<TableCell align="right">
												<Typography color={category.remaining < 0 ? 'error' : 'success.main'}>
													${category.remaining.toFixed(2)}
												</Typography>
											</TableCell>
											<TableCell align="center" sx={{ minWidth: 120 }}>
												<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
													<LinearProgress
														variant="determinate"
														value={Math.min(category.percentage_used, 100)}
														color={getProgressColor(category.percentage_used)}
														sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
													/>
													<Typography variant="caption" sx={{ minWidth: 40 }}>
														{category.percentage_used.toFixed(0)}%
													</Typography>
												</Box>
											</TableCell>
											<TableCell align="right">
												<Typography variant="body2" color="textSecondary">
													${category.daily_allowance.toFixed(2)}
												</Typography>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</TableContainer>
					</>
				)}

				{/* Savings Categories */}
				{savingsCategories.length > 0 && (
					<>
						<Typography variant="h6" gutterBottom sx={{ mt: 2, mb: 1 }}>
							Savings Categories
						</Typography>
						<TableContainer component={Paper}>
							<Table>
								<TableHead>
									<TableRow>
										<TableCell>Category</TableCell>
										<TableCell align="right">Target</TableCell>
										<TableCell align="right">Saved</TableCell>
										<TableCell align="right">Remaining</TableCell>
										<TableCell align="center">Progress</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{savingsCategories.map((category: any) => (
										<TableRow key={category.category_id}>
											<TableCell>
												<Box display="flex" alignItems="center" gap={1}>
													<AccountBalance color="secondary" fontSize="small" />
													{category.category_name}
												</Box>
											</TableCell>
											<TableCell align="right">
												<FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
													<OutlinedInput
														value={budgetAmounts[category.category_id] || ''}
														onChange={(e) => handleAmountChange(category.category_id, e.target.value)}
														startAdornment={<InputAdornment position="start">$</InputAdornment>}
														placeholder="0.00"
													/>
												</FormControl>
											</TableCell>
											<TableCell align="right">
												<Typography color="success.main">
													${Math.abs(category.spent).toFixed(2)}
												</Typography>
											</TableCell>
											<TableCell align="right">
												<Typography>
													${(category.budgeted - Math.abs(category.spent)).toFixed(2)}
												</Typography>
											</TableCell>
											<TableCell align="center" sx={{ minWidth: 120 }}>
												<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
													<LinearProgress
														variant="determinate"
														value={Math.min(category.percentage_used, 100)}
														color="success"
														sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
													/>
													<Typography variant="caption" sx={{ minWidth: 40 }}>
														{category.percentage_used.toFixed(0)}%
													</Typography>
												</Box>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</TableContainer>
					</>
				)}
			</Box>
		);
	};

	const renderSummaryCards = () => {
		const { totalBudgeted, totalSpent, remaining } = calculateTotals();
		const overallPercentage = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

		return (
			<Grid container spacing={3} sx={{ mb: 3 }}>
				<Grid item xs={12} md={3}>
					<Card>
						<CardContent>
							<Box display="flex" alignItems="center" mb={2}>
								<AccountBalance color="primary" sx={{ mr: 1 }} />
								<Typography color="textSecondary" variant="subtitle2">
									Total Budgeted
								</Typography>
							</Box>
							<Typography variant="h5">${totalBudgeted.toFixed(2)}</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid item xs={12} md={3}>
					<Card>
						<CardContent>
							<Box display="flex" alignItems="center" mb={2}>
								<TrendingUp color="info" sx={{ mr: 1 }} />
								<Typography color="textSecondary" variant="subtitle2">
									Total Spent
								</Typography>
							</Box>
							<Typography variant="h5">${totalSpent.toFixed(2)}</Typography>
							<LinearProgress
								variant="determinate"
								value={Math.min(overallPercentage, 100)}
								color={getProgressColor(overallPercentage)}
								sx={{ mt: 1 }}
							/>
						</CardContent>
					</Card>
				</Grid>
				<Grid item xs={12} md={3}>
					<Card>
						<CardContent>
							<Box display="flex" alignItems="center" mb={2}>
								<AttachMoney color={remaining >= 0 ? 'success' : 'error'} sx={{ mr: 1 }} />
								<Typography color="textSecondary" variant="subtitle2">
									Remaining
								</Typography>
							</Box>
							<Typography variant="h5" color={remaining >= 0 ? 'success.main' : 'error.main'}>
								${remaining.toFixed(2)}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid item xs={12} md={3}>
					<Card>
						<CardContent>
							<Box display="flex" alignItems="center" mb={2}>
								<CalendarMonth color="secondary" sx={{ mr: 1 }} />
								<Typography color="textSecondary" variant="subtitle2">
									Days Remaining
								</Typography>
							</Box>
							<Typography variant="h5">{budget?.days_remaining || 0}</Typography>
						</CardContent>
					</Card>
				</Grid>
			</Grid>
		);
	};

	const renderHistoryChart = () => {
		if (!budgetHistory || budgetHistory.length === 0) return null;

		const chartData = budgetHistory.reverse().map((period: any) => ({
			period: format(new Date(period.period), 'MMM yyyy'),
			budgeted: period.total_budgeted,
			spent: period.total_spent,
			remaining: period.total_budgeted - period.total_spent,
		}));

		return (
			<Paper sx={{ p: 3, mt: 3 }}>
				<Typography variant="h6" gutterBottom>
					Budget Trend (Last 12 Months)
				</Typography>
				<ResponsiveContainer width="100%" height={300}>
					<LineChart data={chartData}>
						<CartesianGrid strokeDasharray="3 3" />
						<XAxis dataKey="period" />
						<YAxis />
						<RechartsTooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
						<Line type="monotone" dataKey="budgeted" stroke="#1976d2" name="Budgeted" />
						<Line type="monotone" dataKey="spent" stroke="#d32f2f" name="Spent" />
						<Line type="monotone" dataKey="remaining" stroke="#2e7d32" name="Remaining" />
					</LineChart>
				</ResponsiveContainer>
			</Paper>
		);
	};

	if (budgetLoading || categoriesLoading) {
		return (
			<Box>
				<Typography variant="h4" gutterBottom>Budget Management</Typography>
				<Typography>Loading...</Typography>
			</Box>
		);
	}

	return (
		<Box>
			{/* Header */}
			<Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
				<Typography variant="h4">Budget Management</Typography>
				<Box display="flex" gap={1}>
					<Button
						variant="outlined"
						startIcon={<ContentCopy />}
						onClick={() => setCopyDialogOpen(true)}
					>
						Copy Budget
					</Button>
					<Button
						variant="outlined"
						startIcon={<Compare />}
						onClick={() => setCompareDialogOpen(true)}
					>
						Compare
					</Button>
					<Button
						variant="outlined"
						startIcon={<Refresh />}
						onClick={() => refetchBudget()}
					>
						Refresh
					</Button>
				</Box>
			</Box>

			{/* Period Navigation */}
			<Paper sx={{ p: 2, mb: 3 }}>
				<Box display="flex" justifyContent="space-between" alignItems="center">
					<Box display="flex" alignItems="center" gap={2}>
						<IconButton onClick={() => handlePeriodChange('prev')}>
							<ChevronLeft />
						</IconButton>
						<Typography variant="h6" sx={{ minWidth: 200, textAlign: 'center' }}>
							{getCurrentPeriodLabel()}
						</Typography>
						<IconButton onClick={() => handlePeriodChange('next')}>
							<ChevronRight />
						</IconButton>
					</Box>

					{hasUnsavedChanges && (
						<Box display="flex" alignItems="center" gap={2}>
							<Chip label="Unsaved Changes" color="warning" />
							<Button
								variant="contained"
								startIcon={<Save />}
								onClick={handleBulkSave}
								disabled={bulkUpdateMutation.isPending}
							>
								Save All Changes
							</Button>
						</Box>
					)}
				</Box>
			</Paper>

			{/* Tabs */}
			<Paper sx={{ mb: 3 }}>
				<Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
					<Tab label="Budget Overview" icon={<AccountBalance />} />
					<Tab label="Analytics" icon={<Analytics />} />
					<Tab label="History" icon={<History />} />
				</Tabs>
			</Paper>

			{/* Tab Panels */}
			<TabPanel value={tabValue} index={0}>
				{renderSummaryCards()}
				{renderBudgetTable()}
			</TabPanel>

			<TabPanel value={tabValue} index={1}>
				{renderSummaryCards()}
				{budget?.categories && (
					<Grid container spacing={3}>
						{/* Spending Distribution Pie Chart */}
						<Grid item xs={12} md={6}>
							<Paper sx={{ p: 3 }}>
								<Typography variant="h6" gutterBottom>
									Spending Distribution
								</Typography>
								{budget.categories.filter((cat: any) => cat.spent > 0).length > 0 ? (
									<ResponsiveContainer width="100%" height={300}>
										<PieChart>
											<Pie
												data={budget.categories
													.filter((cat: any) => cat.spent > 0)
													.map((cat: any) => ({
														name: cat.category_name,
														value: cat.spent,
													}))}
												cx="50%"
												cy="50%"
												labelLine={false}
												label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
												outerRadius={80}
												fill="#8884d8"
												dataKey="value"
											>
												{budget.categories
													.filter((cat: any) => cat.spent > 0)
													.map((entry: any, index: number) => (
														<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
													))}
											</Pie>
											<RechartsTooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
										</PieChart>
									</ResponsiveContainer>
								) : (
									<Typography color="textSecondary" sx={{ textAlign: 'center', py: 4 }}>
										No spending data available for this period
									</Typography>
								)}
							</Paper>
						</Grid>

						{/* Budget vs Actual Bar Chart */}
						<Grid item xs={12} md={6}>
							<Paper sx={{ p: 3 }}>
								<Typography variant="h6" gutterBottom>
									Budget vs Actual
								</Typography>
								<ResponsiveContainer width="100%" height={300}>
									<BarChart data={budget.categories.filter((cat: any) => cat.budgeted > 0)}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="category_name" />
										<YAxis />
										<RechartsTooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
										<Bar dataKey="budgeted" fill="#82ca9d" name="Budget" />
										<Bar dataKey="spent" fill="#8884d8" name="Spent" />
									</BarChart>
								</ResponsiveContainer>
							</Paper>
						</Grid>
					</Grid>
				)}
			</TabPanel>

			<TabPanel value={tabValue} index={2}>
				{renderHistoryChart()}
			</TabPanel>

			{/* Compare Dialog */}
			<Dialog open={compareDialogOpen} onClose={() => setCompareDialogOpen(false)} maxWidth="md" fullWidth>
				<DialogTitle>Budget Comparison</DialogTitle>
				<DialogContent>
					<Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
						<DatePicker
							label="Compare Period"
							value={comparePeriod}
							onChange={(date) => date && setComparePeriod(startOfMonth(date))}
							views={['year', 'month']}
							slotProps={{ textField: { size: 'small' } }}
						/>
						<Typography>vs</Typography>
						<Typography variant="body1" sx={{ fontWeight: 'medium' }}>
							{format(currentPeriod, 'MMMM yyyy')}
						</Typography>
					</Box>

					{budgetComparison && (
						<Box>
							<Grid container spacing={2}>
								<Grid item xs={6}>
									<Paper sx={{ p: 2, textAlign: 'center' }}>
										<Typography variant="h6">{format(comparePeriod, 'MMM yyyy')}</Typography>
										<Typography variant="h5" color="primary">
											${budgetComparison.compare_period.total_budgeted.toFixed(2)}
										</Typography>
										<Typography variant="body2" color="textSecondary">Budgeted</Typography>
									</Paper>
								</Grid>
								<Grid item xs={6}>
									<Paper sx={{ p: 2, textAlign: 'center' }}>
										<Typography variant="h6">{format(currentPeriod, 'MMM yyyy')}</Typography>
										<Typography variant="h5" color="primary">
											${budgetComparison.current_period.total_budgeted.toFixed(2)}
										</Typography>
										<Typography variant="body2" color="textSecondary">Budgeted</Typography>
									</Paper>
								</Grid>
							</Grid>

							<Box sx={{ mt: 3 }}>
								<Typography variant="h6" gutterBottom>
									Difference:
									<Chip
										label={`$${Math.abs(budgetComparison.differences.total_budgeted_diff).toFixed(2)}`}
										color={budgetComparison.differences.total_budgeted_diff >= 0 ? 'success' : 'error'}
										icon={budgetComparison.differences.total_budgeted_diff >= 0 ? <TrendingUp /> : <TrendingDown />}
										sx={{ ml: 1 }}
									/>
								</Typography>
							</Box>
						</Box>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setCompareDialogOpen(false)}>Close</Button>
				</DialogActions>
			</Dialog>

			{/* Copy Budget Dialog */}
			<Dialog open={copyDialogOpen} onClose={() => setCopyDialogOpen(false)} maxWidth="lg" fullWidth>
				<DialogTitle>Copy Budget Settings</DialogTitle>
				<DialogContent>
					<Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
						<Typography variant="body1" sx={{ fontWeight: 'medium' }}>
							Copy from:
						</Typography>
						<DatePicker
							label="Source Period"
							value={copyFromPeriod}
							onChange={(date) => date && setCopyFromPeriod(startOfMonth(date))}
							views={['year', 'month']}
							slotProps={{ textField: { size: 'small' } }}
						/>
						<Typography>to</Typography>
						<Typography variant="body1" sx={{ fontWeight: 'medium' }}>
							{format(currentPeriod, 'MMMM yyyy')} (Current)
						</Typography>
					</Box>

					{copyFromBudget && (
						<Box>
							<Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
								Side-by-Side Comparison
							</Typography>

							<Grid container spacing={3}>
								{/* Source Budget (Left) */}
								<Grid item xs={6}>
									<Paper sx={{ p: 2 }}>
										<Typography variant="h6" sx={{ mb: 2, textAlign: 'center', bgcolor: 'primary.light', color: 'primary.contrastText', p: 1, borderRadius: 1 }}>
											{format(copyFromPeriod, 'MMMM yyyy')} (Source)
										</Typography>

										<Box sx={{ mb: 2, textAlign: 'center' }}>
											<Typography variant="body2" color="textSecondary">Total Budgeted</Typography>
											<Typography variant="h5" color="primary">
												${copyFromBudget.total_budgeted?.toFixed(2) || '0.00'}
											</Typography>
										</Box>

										<TableContainer sx={{ maxHeight: 400 }}>
											<Table size="small">
												<TableHead>
													<TableRow>
														<TableCell>Category</TableCell>
														<TableCell align="right">Amount</TableCell>
													</TableRow>
												</TableHead>
												<TableBody>
													{copyFromBudget.categories?.filter((cat: any) => cat.budgeted > 0).map((category: any) => (
														<TableRow key={category.category_id}>
															<TableCell>
																<Typography variant="body2">{category.category_name}</Typography>
															</TableCell>
															<TableCell align="right">
																<Typography variant="body2" color="primary">
																	${category.budgeted.toFixed(2)}
																</Typography>
															</TableCell>
														</TableRow>
													))}
													{(!copyFromBudget.categories || copyFromBudget.categories.filter((cat: any) => cat.budgeted > 0).length === 0) && (
														<TableRow>
															<TableCell colSpan={2}>
																<Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center', py: 2 }}>
																	No budget data for this period
																</Typography>
															</TableCell>
														</TableRow>
													)}
												</TableBody>
											</Table>
										</TableContainer>
									</Paper>
								</Grid>

								{/* Current Budget (Right) */}
								<Grid item xs={6}>
									<Paper sx={{ p: 2 }}>
										<Typography variant="h6" sx={{ mb: 2, textAlign: 'center', bgcolor: 'secondary.light', color: 'secondary.contrastText', p: 1, borderRadius: 1 }}>
											{format(currentPeriod, 'MMMM yyyy')} (Current)
										</Typography>

										<Box sx={{ mb: 2, textAlign: 'center' }}>
											<Typography variant="body2" color="textSecondary">Total Budgeted</Typography>
											<Typography variant="h5" color="secondary">
												${budget?.total_budgeted?.toFixed(2) || '0.00'}
											</Typography>
										</Box>

										<TableContainer sx={{ maxHeight: 400 }}>
											<Table size="small">
												<TableHead>
													<TableRow>
														<TableCell>Category</TableCell>
														<TableCell align="right">Amount</TableCell>
													</TableRow>
												</TableHead>
												<TableBody>
													{budget?.categories?.filter((cat: any) => cat.budgeted > 0).map((category: any) => (
														<TableRow key={category.category_id}>
															<TableCell>
																<Typography variant="body2">{category.category_name}</Typography>
															</TableCell>
															<TableCell align="right">
																<Typography variant="body2" color="secondary">
																	${category.budgeted.toFixed(2)}
																</Typography>
															</TableCell>
														</TableRow>
													))}
													{(!budget?.categories || budget.categories.filter((cat: any) => cat.budgeted > 0).length === 0) && (
														<TableRow>
															<TableCell colSpan={2}>
																<Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center', py: 2 }}>
																	No budget data for this period
																</Typography>
															</TableCell>
														</TableRow>
													)}
												</TableBody>
											</Table>
										</TableContainer>
									</Paper>
								</Grid>
							</Grid>

							{copyFromBudget.categories && copyFromBudget.categories.filter((cat: any) => cat.budgeted > 0).length > 0 && (
								<Alert severity="info" sx={{ mt: 3 }}>
									<Typography variant="body2">
										<strong>Note:</strong> Copying will replace all current budget amounts with the amounts from {format(copyFromPeriod, 'MMMM yyyy')}.
										This action cannot be undone. Make sure you want to proceed.
									</Typography>
								</Alert>
							)}
						</Box>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setCopyDialogOpen(false)}>Cancel</Button>
					<Button
						variant="contained"
						color="primary"
						onClick={handleCopyBudget}
						disabled={copyBudgetMutation.isPending || !copyFromBudget?.categories || copyFromBudget.categories.filter((cat: any) => cat.budgeted > 0).length === 0}
					>
						{copyBudgetMutation.isPending ? 'Copying...' : 'Copy Budget'}
					</Button>
				</DialogActions>
			</Dialog>

			{/* Floating Action Button for Quick Add */}
			{!categories || categories.length === 0 ? (
				<Fab
					color="primary"
					sx={{ position: 'fixed', bottom: 16, right: 16 }}
					onClick={() => navigate('/categories')}
				>
					<Add />
				</Fab>
			) : null}
		</Box>
	);
}

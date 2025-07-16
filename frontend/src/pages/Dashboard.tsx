import { useQuery } from '@tanstack/react-query';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Alert,
  Button,
  Skeleton,
  CircularProgress,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
  IconButton,
  Tooltip as MuiTooltip,
  CardHeader,
  CardActions,
} from '@mui/material';
import {
  TrendingUp,
  AccountBalance,
  CalendarToday,
  Warning,
  Add,
  Category,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  Receipt,
  SwapHoriz,
  TrendingDown,
  AttachMoney,
  CompareArrows,
  History,
  ErrorOutline,
  CheckCircle,
  SyncAlt,
  Assessment,
  AccountBalanceWallet,
  Savings,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend, Area, AreaChart } from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { apiClient } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function Dashboard() {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Generate month options (last 12 months and next 6 months)
  const monthOptions = [];
  for (let i = -12; i <= 6; i++) {
    const monthDate = i < 0 ? subMonths(new Date(), Math.abs(i)) : addMonths(new Date(), i);
    monthOptions.push({
      value: format(monthDate, 'yyyy-MM'),
      label: format(monthDate, 'MMMM yyyy'),
      date: monthDate
    });
  }

  const { data: budget, isLoading: budgetLoading, error: budgetError } = useQuery({
    queryKey: ['currentBudget', format(selectedMonth, 'yyyy-MM')],
    queryFn: async () => {
      const response = await apiClient.getCurrentBudget({
        month: format(selectedMonth, 'yyyy-MM')
      });
      return response.data;
    },
  });

  const { data: allowances, isLoading: allowancesLoading, error: allowancesError } = useQuery({
    queryKey: ['dailyAllowances', format(selectedMonth, 'yyyy-MM')],
    queryFn: async () => {
      const response = await apiClient.getDailyAllowances({
        month: format(selectedMonth, 'yyyy-MM')
      });
      return response.data;
    },
  });

  const { data: reviewCount, isLoading: reviewLoading } = useQuery({
    queryKey: ['reviewCount'],
    queryFn: async () => {
      const response = await apiClient.getReviewQueue();
      return response.data.length;
    },
    initialData: 0,
  });

  // Additional API queries for comprehensive dashboard
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await apiClient.getAccounts();
      return response.data;
    },
  });

  const { data: recentTransactions, isLoading: recentTransactionsLoading } = useQuery({
    queryKey: ['recentTransactions'],
    queryFn: async () => {
      const response = await apiClient.getTransactions({ limit: 10, exclude_transfers: true });
      return response.data;
    },
  });

  const { data: transfers, isLoading: transfersLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: async () => {
      const response = await apiClient.getTransfers(10);
      return response.data;
    },
  });

  const { data: unallocatedTransfers, isLoading: unallocatedTransfersLoading } = useQuery({
    queryKey: ['unallocatedTransfers'],
    queryFn: async () => {
      const response = await apiClient.getUnallocatedTransfers(5);
      return response.data;
    },
  });

  const { data: budgetHistory, isLoading: budgetHistoryLoading } = useQuery({
    queryKey: ['budgetHistory'],
    queryFn: async () => {
      const response = await apiClient.getBudgetHistory(6);
      return response.data;
    },
  });

  // Check if there's any error with data fetching
  if (budgetError || allowancesError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          There was an error loading your dashboard data. Please try again later.
        </Alert>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </Box>
    );
  }

  // Loading state
  if (budgetLoading || allowancesLoading || accountsLoading || recentTransactionsLoading || budgetHistoryLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>Dashboard</Typography>
        <Grid container spacing={3}>
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Grid item xs={12} md={4} key={item}>
              <Card>
                <CardContent>
                  <Skeleton variant="rectangular" height={20} width="60%" sx={{ mb: 1 }} />
                  <Skeleton variant="rectangular" height={40} />
                  <Skeleton variant="rectangular" height={10} width="40%" sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  // Helper functions
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CH', {
      style: 'currency',
      currency: 'CHF',
    }).format(amount);
  };

  const getTotalAccountBalance = () => {
    if (!accounts || !Array.isArray(accounts)) return 0;
    return accounts.reduce((total, account) => total + (account.balance || 0), 0);
  };

  const getTotalTransactionCount = () => {
    if (!accounts || !Array.isArray(accounts)) return 0;
    return accounts.reduce((total, account) => total + (account.transaction_count || 0), 0);
  };

  const getAccountIcon = (accountType: string) => {
    switch (accountType) {
      case 'CHECKING':
        return <AccountBalance />;
      case 'SAVINGS':
        return <Savings />;
      case 'CREDIT_CARD':
        return <AccountBalanceWallet />;
      default:
        return <AccountBalance />;
    }
  };

  const getTransactionIcon = (amount: number) => {
    return amount > 0 ? <TrendingUp color="success" /> : <TrendingDown color="error" />;
  };

  // Check if there's any budget data
  const hasBudgetData = budget?.categories?.some((cat: any) => cat.budgeted > 0);

  const pieData = budget?.categories
    ?.filter((cat: any) => !cat.is_savings && cat.spent > 0)
    .map((cat: any) => ({
      name: cat.category_name,
      value: cat.spent,
    })) || [];

  const barData = budget?.categories
    ?.filter((cat: any) => !cat.is_automatic && !cat.is_savings)
    .map((cat: any) => ({
      name: cat.category_name,
      budget: cat.budgeted,
      spent: cat.spent,
    })) || [];

  // Prepare budget history data for trend chart
  const budgetTrendData = budgetHistory?.map((item: any) => ({
    month: format(new Date(item.period), 'MMM yyyy'),
    budget: item.total_budgeted,
    spent: item.total_spent,
    remaining: item.total_budgeted - item.total_spent,
  })) || [];

  const totalBudget = budget?.total_budgeted || 0;
  const totalSpent = budget?.total_spent || 0;
  const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  // Empty state - no budget data or no categories
  if (!hasBudgetData || !budget?.categories || budget.categories.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>Dashboard</Typography>

        <Paper sx={{ p: 4, textAlign: 'center', mb: 3 }}>
          <Box sx={{ mb: 4 }}>
            <PieChartIcon sx={{ fontSize: 80, color: 'primary.main', mb: 3 }} />
            <Typography variant="h4" gutterBottom>Welcome to BudgetLens!</Typography>
            <Typography variant="h6" color="textSecondary" sx={{ mb: 3 }}>
              Let's set up your budget to start tracking your finances
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, maxWidth: 400, mx: 'auto' }}>
            <Button
              variant="contained"
              fullWidth
              size="large"
              startIcon={<Category />}
              onClick={() => navigate('/categories')}
              sx={{ py: 1.5 }}
            >
              1. Set Up Your Categories
            </Button>

            <Typography variant="body2" color="textSecondary">Then</Typography>

            <Button
              variant="contained"
              color="secondary"
              fullWidth
              size="large"
              startIcon={<Add />}
              onClick={() => navigate('/budgets')}
              sx={{ py: 1.5 }}
            >
              2. Create Your Budget
            </Button>
          </Box>
        </Paper>

        {reviewCount > 0 && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            You have {reviewCount} transactions that need review.
            <Button color="inherit" onClick={() => navigate('/review')} sx={{ ml: 1 }}>
              Review now →
            </Button>
          </Alert>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Dashboard
        </Typography>

        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Month</InputLabel>
          <Select
            value={format(selectedMonth, 'yyyy-MM')}
            label="Month"
            onChange={(e) => {
              const selectedOption = monthOptions.find(option => option.value === e.target.value);
              if (selectedOption) {
                setSelectedMonth(selectedOption.date);
              }
            }}
          >
            {monthOptions && Array.isArray(monthOptions) ? monthOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            )) : null}
          </Select>
        </FormControl>
      </Box>

      {/* Alerts */}
      {reviewCount > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          You have {reviewCount} transactions that need review.
          <Button color="inherit" onClick={() => navigate('/review')} sx={{ ml: 1 }}>
            Review now →
          </Button>
        </Alert>
      )}

      {unallocatedTransfers && unallocatedTransfers.length > 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          You have {unallocatedTransfers.length} transfers that need allocation.
          <Button color="inherit" onClick={() => navigate('/savings')} sx={{ ml: 1 }}>
            Allocate now →
          </Button>
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Top Row - Key Metrics */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <AccountBalance color="primary" sx={{ mr: 1 }} />
                <Typography color="textSecondary" gutterBottom>
                  Monthly Budget
                </Typography>
              </Box>
              <Typography variant="h5">
                {formatCurrency(totalBudget)}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={Math.min(overallPercentage, 100)}
                sx={{ mt: 2 }}
                color={overallPercentage > 90 ? 'error' : 'primary'}
              />
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                {overallPercentage.toFixed(1)}% used
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <TrendingUp color="success" sx={{ mr: 1 }} />
                <Typography color="textSecondary" gutterBottom>
                  Total Spent
                </Typography>
              </Box>
              <Typography variant="h5">
                {formatCurrency(totalSpent)}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                {formatCurrency(totalBudget - totalSpent)} remaining
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <AttachMoney color="info" sx={{ mr: 1 }} />
                <Typography color="textSecondary" gutterBottom>
                  Total Account Balance
                </Typography>
              </Box>
              <Typography variant="h5">
                {formatCurrency(getTotalAccountBalance())}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                {accounts?.length || 0} accounts
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Receipt color="warning" sx={{ mr: 1 }} />
                <Typography color="textSecondary" gutterBottom>
                  Total Transactions
                </Typography>
              </Box>
              <Typography variant="h5">
                {getTotalTransactionCount()}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                {reviewCount} need review
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Second Row - Accounts Overview */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Account Overview
            </Typography>
            {accounts && Array.isArray(accounts) && accounts.length > 0 ? (
              <List>
                {accounts.slice(0, 5).map((account: any, index: number) => (
                  <ListItem key={account.id}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: account.is_default ? 'primary.main' : 'grey.300' }}>
                        {getAccountIcon(account.account_type)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={account.name}
                      secondary={`${account.account_type} • ${account.institution || 'No Institution'}`}
                    />
                    <Box textAlign="right">
                      <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                        {formatCurrency(account.balance || 0)}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {account.transaction_count || 0} transactions
                      </Typography>
                    </Box>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="textSecondary">
                  No accounts configured yet.
                </Typography>
                <Button
                  variant="text"
                  onClick={() => navigate('/accounts')}
                  sx={{ mt: 1 }}
                >
                  Add Account
                </Button>
              </Box>
            )}
            {accounts && accounts.length > 5 && (
              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Button onClick={() => navigate('/accounts')}>
                  View All Accounts
                </Button>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Daily Allowances */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Daily Allowances
            </Typography>
            {allowances && Array.isArray(allowances) && allowances.length > 0 ? (
              allowances.map((allowance: any, index: number) => (
                <Box key={index} sx={{ mb: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body1">{allowance.category}</Typography>
                    <Chip
                      label={`${formatCurrency(allowance.daily_allowance)}/day`}
                      color={allowance.daily_allowance > 0 ? 'success' : 'error'}
                      size="small"
                    />
                  </Box>
                  <Typography variant="caption" color="textSecondary">
                    {formatCurrency(allowance.total_remaining)} total remaining
                  </Typography>
                </Box>
              ))
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="textSecondary">
                  No daily allowances available. Set up your budget to see daily spending targets.
                </Typography>
                <Button
                  variant="text"
                  onClick={() => navigate('/budgets')}
                  sx={{ mt: 1 }}
                >
                  Set Up Budget
                </Button>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Recent Transactions */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Recent Transactions
            </Typography>
            {recentTransactions && Array.isArray(recentTransactions) && recentTransactions.length > 0 ? (
              <List>
                {recentTransactions.slice(0, 5).map((transaction: any, index: number) => (
                  <ListItem key={transaction.id}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: transaction.amount > 0 ? 'success.main' : 'error.main' }}>
                        {getTransactionIcon(transaction.amount)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={transaction.vendor_name || transaction.description}
                      secondary={`${format(new Date(transaction.date), 'MMM dd, yyyy')} • ${transaction.category_name || 'Uncategorized'}`}
                    />
                    <Typography variant="body2" sx={{
                      color: transaction.amount > 0 ? 'success.main' : 'error.main',
                      fontWeight: 'bold'
                    }}>
                      {formatCurrency(transaction.amount)}
                    </Typography>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="textSecondary">
                  No recent transactions found.
                </Typography>
              </Box>
            )}
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Button onClick={() => navigate('/transactions')}>
                View All Transactions
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Recent Transfers */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Recent Transfers
            </Typography>
            {transfers && Array.isArray(transfers) && transfers.length > 0 ? (
              <List>
                {transfers.slice(0, 5).map((transfer: any, index: number) => (
                  <ListItem key={transfer.id}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: 'info.main' }}>
                        <SwapHoriz />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={`${transfer.from_account_name || 'Unknown'} → ${transfer.to_account_name || 'Unknown'}`}
                      secondary={format(new Date(transfer.date), 'MMM dd, yyyy')}
                    />
                    <Box textAlign="right">
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {formatCurrency(transfer.amount)}
                      </Typography>
                      <Chip
                        label={transfer.is_confirmed ? 'Confirmed' : 'Pending'}
                        color={transfer.is_confirmed ? 'success' : 'warning'}
                        size="small"
                      />
                    </Box>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="textSecondary">
                  No recent transfers found.
                </Typography>
              </Box>
            )}
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Button onClick={() => navigate('/transfers')}>
                View All Transfers
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Spending by Category Pie Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Spending by Category
            </Typography>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData && Array.isArray(pieData) ? pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    )) : null}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="textSecondary">
                  No spending data available yet. Transactions will appear here once they're categorized.
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Budget Trend */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Budget Trend (Last 6 Months)
            </Typography>
            {budgetTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={budgetTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="budget" stroke="#8884d8" name="Budget" />
                  <Line type="monotone" dataKey="spent" stroke="#82ca9d" name="Spent" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="textSecondary">
                  No budget history available yet.
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Budget vs Actual Bar Chart */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Budget vs Actual Spending
            </Typography>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any, name: any, props: any) => [
                      formatCurrency(value),
                      `${name} (${props.payload.name})`
                    ]}
                  />
                  <Bar dataKey="budget" fill="#82ca9d" name="Budget" />
                  <Bar dataKey="spent" fill="#8884d8" name="Spent" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="textSecondary">
                  No data available for comparison. Add budget categories and track spending to see this chart.
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
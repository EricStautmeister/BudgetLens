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
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { apiClient } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function Dashboard() {
  const navigate = useNavigate();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
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

  // Show welcome message if first time or no budget data
  useEffect(() => {
    if (!budgetLoading && budget) {
      const hasVisitedDashboard = localStorage.getItem('hasVisitedDashboard');
      const hasBudgetData = budget.categories?.some((cat: any) => cat.budgeted > 0);
      const hasCategories = budget.categories && budget.categories.length > 0;

      // Show welcome if:
      // 1. First visit, OR
      // 2. No categories exist, OR 
      // 3. Categories exist but no budget amounts set
      if (!hasVisitedDashboard || !hasCategories || !hasBudgetData) {
        setWelcomeOpen(true);
        localStorage.setItem('hasVisitedDashboard', 'true');
      }
    }
  }, [budgetLoading, budget]);

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
  if (budgetLoading || allowancesLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>Dashboard</Typography>
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map((item) => (
            <Grid item xs={12} md={3} key={item}>
              <Card>
                <CardContent>
                  <Skeleton variant="rectangular" height={20} width="60%" sx={{ mb: 1 }} />
                  <Skeleton variant="rectangular" height={40} />
                  <Skeleton variant="rectangular" height={10} width="40%" sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress />
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress />
            </Paper>
          </Grid>
        </Grid>
      </Box>
    );
  }  // Check if there's any budget data
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
            <Typography variant="body1" color="textSecondary" paragraph>
              Follow these two simple steps to get started:
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

          <Box sx={{ mt: 4 }}>
            <Typography variant="body2" color="textSecondary">
              Need help? Each page includes guidance to help you get started.
            </Typography>
          </Box>
        </Paper>

        {reviewCount > 0 && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            You have {reviewCount} transactions that need review.
            <Box component="a" href="/review" sx={{ ml: 1 }}>
              Review now →
            </Box>
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
            {monthOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {reviewCount > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          You have {reviewCount} transactions that need review.
          <Box component="a" href="/review" sx={{ ml: 1 }}>
            Review now →
          </Box>
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Summary Cards */}
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
                ${totalBudget.toFixed(2)}
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
                ${totalSpent.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                ${(totalBudget - totalSpent).toFixed(2)} remaining
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <CalendarToday color="info" sx={{ mr: 1 }} />
                <Typography color="textSecondary" gutterBottom>
                  Days Remaining
                </Typography>
              </Box>
              <Typography variant="h5">
                {budget?.days_remaining || 0}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                in {format(selectedMonth, 'MMMM yyyy')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Warning color="warning" sx={{ mr: 1 }} />
                <Typography color="textSecondary" gutterBottom>
                  Need Review
                </Typography>
              </Box>
              <Typography variant="h5">
                {reviewCount || 0}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                transactions
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Daily Allowances */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Daily Allowances
            </Typography>
            {allowances && allowances.length > 0 ? (
              allowances.map((allowance: any, index: number) => (
                <Box key={index} sx={{ mb: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body1">{allowance.category}</Typography>
                    <Chip
                      label={`$${allowance.daily_allowance.toFixed(2)}/day`}
                      color={allowance.daily_allowance > 0 ? 'success' : 'error'}
                      size="small"
                    />
                  </Box>
                  <Typography variant="caption" color="textSecondary">
                    ${allowance.total_remaining.toFixed(2)} total remaining
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
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
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
                  <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
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

      {/* Welcome Snackbar */}
      <Snackbar
        open={welcomeOpen}
        onClose={() => setWelcomeOpen(false)}
        message="Welcome to BudgetLens! Set up your budget categories to get started."
        action={
          <Button color="inherit" onClick={() => navigate('/budgets')}>
            Set Up Budget
          </Button>
        }
        autoHideDuration={6000}
      />
    </Box>
  );
}
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
} from '@mui/material';
import {
  TrendingUp,
  AccountBalance,
  CalendarToday,
  Warning,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { apiClient } from '../services/api';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function Dashboard() {
  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ['currentBudget'],
    queryFn: async () => {
      const response = await apiClient.getCurrentBudget();
      return response.data;
    },
  });

  const { data: allowances, isLoading: allowancesLoading } = useQuery({
    queryKey: ['dailyAllowances'],
    queryFn: async () => {
      const response = await apiClient.getDailyAllowances();
      return response.data;
    },
  });

  const { data: reviewCount } = useQuery({
    queryKey: ['reviewCount'],
    queryFn: async () => {
      const response = await apiClient.getReviewQueue();
      return response.data.length;
    },
  });

  if (budgetLoading || allowancesLoading) {
    return <LinearProgress />;
  }

  const pieData = budget?.categories
    .filter((cat: any) => !cat.is_savings && cat.spent > 0)
    .map((cat: any) => ({
      name: cat.category_name,
      value: cat.spent,
    })) || [];

  const barData = budget?.categories
    .filter((cat: any) => !cat.is_automatic && !cat.is_savings)
    .map((cat: any) => ({
      name: cat.category_name,
      budget: cat.budgeted,
      spent: cat.spent,
    })) || [];

  const totalBudget = budget?.total_budgeted || 0;
  const totalSpent = budget?.total_spent || 0;
  const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

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
                value={overallPercentage}
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
                in {format(new Date(), 'MMMM yyyy')}
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
            {allowances?.map((allowance: any, index: number) => (
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
            ))}
          </Paper>
        </Grid>

        {/* Spending by Category Pie Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Spending by Category
            </Typography>
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
                  {pieData.map((index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Budget vs Actual Bar Chart */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Budget vs Actual Spending
            </Typography>
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
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
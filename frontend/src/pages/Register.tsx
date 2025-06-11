import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Container, Paper, TextField, Button, Typography, Box, Alert, CircularProgress } from '@mui/material';
import { useForm } from 'react-hook-form';
import { apiClient } from '../services/api';

interface RegisterForm {
	email: string;
	password: string;
	confirmPassword: string;
}

export default function Register() {
	const navigate = useNavigate();
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const {
		register,
		handleSubmit,
		watch,
		formState: { errors },
	} = useForm<RegisterForm>();

	const onSubmit = async (data: RegisterForm) => {
		setError('');
		setLoading(true);

		try {
			await apiClient.register(data.email, data.password);
			await apiClient.login(data.email, data.password);
			navigate('/dashboard');
		} catch (err: any) {
			setError(err.response?.data?.detail || 'Registration failed');
		} finally {
			setLoading(false);
		}
	};

	return (
		<Container component="main" maxWidth="xs">
			<Box
				sx={{
					marginTop: 8,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
				}}>
				<Paper elevation={3} sx={{ p: 4, width: '100%' }}>
					<Typography component="h1" variant="h5" align="center">
						Create BudgetLens Account
					</Typography>

					{error && (
						<Alert severity="error" sx={{ mt: 2 }}>
							{error}
						</Alert>
					)}

					<Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
						<TextField
							margin="normal"
							required
							fullWidth
							id="email"
							label="Email Address"
							autoComplete="email"
							autoFocus
							{...register('email', {
								required: 'Email is required',
								pattern: {
									value: /^\S+@\S+$/i,
									message: 'Invalid email address',
								},
							})}
							error={!!errors.email}
							helperText={errors.email?.message}
						/>
						<TextField
							margin="normal"
							required
							fullWidth
							label="Password"
							type="password"
							id="password"
							{...register('password', {
								required: 'Password is required',
								minLength: {
									value: 8,
									message: 'Password must be at least 8 characters',
								},
							})}
							error={!!errors.password}
							helperText={errors.password?.message}
						/>
						<TextField
							margin="normal"
							required
							fullWidth
							label="Confirm Password"
							type="password"
							id="confirmPassword"
							{...register('confirmPassword', {
								required: 'Please confirm your password',
								validate: (value) => value === watch('password') || 'Passwords do not match',
							})}
							error={!!errors.confirmPassword}
							helperText={errors.confirmPassword?.message}
						/>
						<Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={loading}>
							{loading ? <CircularProgress size={24} /> : 'Sign Up'}
						</Button>
						<Box textAlign="center">
							<Link to="/login">Already have an account? Sign In</Link>
						</Box>
					</Box>
				</Paper>
			</Box>
		</Container>
	);
}

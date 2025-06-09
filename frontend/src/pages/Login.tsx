import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Container, Paper, TextField, Button, Typography, Box, Alert, CircularProgress } from '@mui/material';
import { useForm } from 'react-hook-form';
import { apiClient } from '../services/api';

interface LoginForm {
	email: string;
	password: string;
}

export default function Login() {
	const navigate = useNavigate();
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<LoginForm>();

	const onSubmit = async (data: LoginForm) => {
		setError('');
		setLoading(true);

		try {
			await apiClient.login(data.email, data.password);
			navigate('/dashboard');
		} catch (err: any) {
			setError(err.response?.data?.detail || 'Login failed');
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
						Sign In to PennyPilot
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
							autoComplete="current-password"
							{...register('password', { required: 'Password is required' })}
							error={!!errors.password}
							helperText={errors.password?.message}
						/>
						<Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={loading}>
							{loading ? <CircularProgress size={24} /> : 'Sign In'}
						</Button>
						<Box textAlign="center">
							<Link to="/register">Don't have an account? Sign Up</Link>
						</Box>
					</Box>
				</Paper>
			</Box>
		</Container>
	);
}

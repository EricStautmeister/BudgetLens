import React from 'react';
import { Navigate } from 'react-router-dom';

interface PrivateRouteProps {
	children: React.ReactElement;
}

export default function PrivateRoute({ children }: PrivateRouteProps) {
	const token = localStorage.getItem('access_token');

	return token ? children : <Navigate to="/login" />;
}

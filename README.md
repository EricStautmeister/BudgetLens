# Personal Budgeting Tool

A modern, secure personal budgeting tool that processes CSV bank exports, automates transaction categorization, and provides comprehensive budget tracking with daily allowance calculations.

## Features

-   **CSV Processing System:** Handle multiple bank CSV formats with automatic normalization
-   **Intelligent Transaction Categorization:** Automatically categorize transactions with learning capability
-   **Advanced Budget Management:** Comprehensive budget tracking with daily allowances
-   **Security:** Full implementation of CIAAA Framework (Confidentiality, Integrity, Availability, Authentication, Authorization)

## Technology Stack

-   **Backend:** FastAPI (Python 3.11+)
-   **Frontend:** React 18 + TypeScript + Vite + Material-UI
-   **Database:** PostgreSQL 15+ with SQLAlchemy ORM
-   **Authentication:** JWT tokens with FastAPI-Users
-   **Deployment:** Docker Compose
-   **Task Queue:** Celery with Redis

## Getting Started

### Prerequisites

-   Docker and Docker Compose
-   Git

### Installation

1. Clone the repository:

    ```bash
    git clone <repository-url>
    ```

2. Create a `.env` file in the root directory with the following variables:

    ```
    SECRET_KEY=your_secret_key
    JWT_SECRET=your_jwt_secret
    ```

3. Start the services:

    ```bash
    docker-compose up -d
    ```

4. Access the application:
    - Frontend: http://localhost:3000
    - Backend API: http://localhost:8000
    - API Documentation: http://localhost:8000/docs

## Development

### Backend Development

The backend is built with FastAPI. To run it locally:

1. Set up a virtual environment and install dependencies:

    ```bash
    cd backend
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install -r requirements.txt
    ```

2. Set up environment variables and run the development server:
    ```bash
    uvicorn app.main:app --reload
    ```

### Frontend Development

The frontend is built with React and TypeScript. To run it locally:

1. Install dependencies:

    ```bash
    cd frontend
    npm install
    ```

2. Start the development server:
    ```bash
    npm run dev
    ```

## Documentation

-   API documentation is available at `http://localhost:8000/docs` when the server is running.
-   Detailed project specification can be found in `development_specification.md`.

## License

[MIT](LICENSE)

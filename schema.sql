-- ========================================================
-- Smart HR & Recruitment Platform — PostgreSQL Schema
-- Database Name: smart_hr_db
-- ========================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Enum Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'committee_chair', 'committee_member', 'hr_specialist');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('draft', 'published', 'closed', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE application_status AS ENUM ('new', 'assessment_pending', 'assessment_passed', 'assessment_failed', 'under_review', 'interview_scheduled', 'accepted', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE interview_status AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Users & Committee Members Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(30),
    role user_role DEFAULT 'committee_member',
    avatar_color VARCHAR(10) DEFAULT '#E0A21B',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Jobs Table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    department VARCHAR(100) NOT NULL,
    city VARCHAR(100) DEFAULT 'الرياض',
    employment_type VARCHAR(50) DEFAULT 'دوام كامل',
    experience_years_min INT DEFAULT 2,
    salary_range VARCHAR(100),
    description TEXT,
    requirements JSONB DEFAULT '[]'::jsonb, -- Mandatory & preferred skills
    passing_score INT DEFAULT 60, -- Passing percentage (e.g. 60%)
    status job_status DEFAULT 'published',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Job AI Prompts & Configuration
CREATE TABLE IF NOT EXISTS job_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    prompt_version INT DEFAULT 1,
    ai_provider VARCHAR(50) DEFAULT 'Gemini', -- OpenAI, Gemini, Claude, etc.
    ai_model VARCHAR(100) DEFAULT 'gemini-1.5-pro',
    system_prompt TEXT,
    question_generation_prompt TEXT,
    scoring_rubric JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Candidates Table
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    city VARCHAR(100),
    current_title VARCHAR(150),
    years_of_experience INT DEFAULT 0,
    cv_file_url TEXT,
    cv_extracted_text TEXT,
    skills JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Applications Table
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    status application_status DEFAULT 'new',
    assessment_score NUMERIC(5,2) DEFAULT NULL,
    cv_match_score NUMERIC(5,2) DEFAULT NULL,
    ai_overall_score NUMERIC(5,2) DEFAULT NULL,
    ai_analysis_report JSONB DEFAULT '{}'::jsonb, -- strengths, gaps, confidence, recommendation
    integrity_flags JSONB DEFAULT '[]'::jsonb, -- tab switches, paste detection, response timings
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_job_candidate UNIQUE(job_id, candidate_id)
);

-- 8. Assessment Answers Table
CREATE TABLE IF NOT EXISTS assessment_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    question_number INT NOT NULL,
    question_type VARCHAR(50) NOT NULL, -- multiple_choice, numeric, text, attachment
    question_text TEXT NOT NULL,
    candidate_answer TEXT,
    attachment_url TEXT,
    score_achieved NUMERIC(5,2) DEFAULT 0,
    max_score NUMERIC(5,2) DEFAULT 10,
    ai_feedback TEXT,
    time_spent_seconds INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Interviews Table
CREATE TABLE IF NOT EXISTS interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    interviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    meeting_link TEXT, -- Google Meet / Zoom link
    whatsapp_phone VARCHAR(30),
    whatsapp_message_sent BOOLEAN DEFAULT FALSE,
    status interview_status DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Committee Evaluations Table
CREATE TABLE IF NOT EXISTS committee_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    evaluator_id UUID REFERENCES users(id) ON DELETE CASCADE,
    technical_score INT CHECK (technical_score BETWEEN 1 AND 10),
    communication_score INT CHECK (communication_score BETWEEN 1 AND 10),
    cultural_fit_score INT CHECK (cultural_fit_score BETWEEN 1 AND 10),
    final_recommendation VARCHAR(50), -- recommend_hire, consider, reject
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_application_evaluator UNIQUE(application_id, evaluator_id)
);

-- 11. Audit Logs Table (Governance)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled ON interviews(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);

-- ========================================================
-- Seed Initial Data (بيانات تجريبية أولية)
-- ========================================================

-- Insert Sample Committee Member
INSERT INTO users (id, full_name, email, role, avatar_color)
VALUES 
('11111111-1111-1111-1111-111111111111', 'سارة المطيري', 'sara@example.com', 'committee_chair', '#E0A21B')
ON CONFLICT (email) DO NOTHING;

-- Insert Sample Job
INSERT INTO jobs (id, title, department, city, experience_years_min, passing_score, status)
VALUES
('22222222-2222-2222-2222-222222222222', 'فني دهانات وديكورات متقدمة', 'إدارة التشغيل والمشاريع', 'الرياض', 3, 60, 'published')
ON CONFLICT (id) DO NOTHING;

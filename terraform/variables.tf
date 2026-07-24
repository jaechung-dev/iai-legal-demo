variable "aws_region" {
  default = "ap-southeast-2"  # Sydney
}

variable "project" {
  default = "iai-legal-demo"
}

variable "openai_api_key" {
  sensitive = true
}

variable "database_url" {
  sensitive = true
}

variable "jwt_secret" {
  sensitive   = true
  default     = "change-me-in-production"
}

variable "admin_password" {
  sensitive = true
  default   = "admin1234"
}

variable "from_email" {
  default = "noreply@probonoai.com.au"
}

variable "frontend_url" {
  default = "https://www.probonoai.com.au"
}

variable "backend_url" {
  default = "https://6arf47x0pk.execute-api.ap-southeast-2.amazonaws.com"
}

variable "google_client_id" {
  sensitive = true
  default   = ""
}

variable "google_client_secret" {
  sensitive = true
  default   = ""
}

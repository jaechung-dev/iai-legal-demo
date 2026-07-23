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

variable "sojung_password" {
  sensitive = true
  default   = "demo1234"
}

variable "admin_password" {
  sensitive = true
  default   = "admin1234"
}

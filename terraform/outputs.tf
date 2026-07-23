output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "cloudfront_domain" {
  description = "Add a CNAME record in GoDaddy: probonoai.com.au → this value"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "api_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "s3_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

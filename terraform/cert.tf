resource "aws_acm_certificate" "frontend" {
  provider                  = aws.us_east_1
  domain_name               = "probonoai.com.au"
  subject_alternative_names = ["www.probonoai.com.au", "preview.probonoai.com.au"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Validation records are created in dns.tf (aws_route53_record.cert_validation).
# Terraform resolves the dependency automatically via the fqdn reference below.
resource "aws_acm_certificate_validation" "frontend" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

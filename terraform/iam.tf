# ── GitHub Actions OIDC ───────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["2b18947a6a9fc7764fd8b5fb18a863b0c6dac24f"]
}

resource "aws_iam_role" "github_actions" {
  name = "${var.project}-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:jaechung-dev*iai-legal-demo*:*"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_actions" {
  name = "deploy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Lambda"
        Effect = "Allow"
        Action = ["lambda:UpdateFunctionCode", "lambda:GetFunction"]
        Resource = [
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.project}-api",
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.project}-ai",
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.project}-mcp",
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.project}-ingest"
        ]
      },
      {
        Sid    = "S3"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::${aws_s3_bucket.frontend.bucket}",
          "arn:aws:s3:::${aws_s3_bucket.frontend.bucket}/*"
        ]
      },
      {
        Sid    = "CloudFront"
        Effect = "Allow"
        Action = ["cloudfront:CreateInvalidation"]
        Resource = "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${aws_cloudfront_distribution.frontend.id}"
      }
    ]
  })
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
}

# ── Lambda execution role ─────────────────────────────────────────────────────

resource "aws_iam_role" "lambda" {
  name = "${var.project}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_ses" {
  name = "ses-send"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy" "lambda_s3_uploads" {
  name = "s3-uploads"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject"]
      Resource = "${aws_s3_bucket.uploads.arn}/*"
    }]
  })
}

resource "aws_iam_role_policy" "lambda_sqs_ingest" {
  name = "sqs-ingest"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:ChangeMessageVisibility"
      ]
      Resource = [
        aws_sqs_queue.ingest.arn,
        aws_sqs_queue.ingest_dlq.arn
      ]
    }]
  })
}

resource "aws_iam_role_policy" "lambda_textract" {
  name = "textract"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["textract:DetectDocumentText", "textract:AnalyzeDocument"]
      Resource = "*"
    }]
  })
}

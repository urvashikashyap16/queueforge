terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Recommended: keep state in S3 so CI and teammates share it.
  # backend "s3" {
  #   bucket = "your-tf-state-bucket"
  #   key    = "queueforge/terraform.tfstate"
  #   region = "ap-south-1"
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "queueforge"
      ManagedBy = "terraform"
    }
  }
}

import React from 'react';
import { InputField } from './UIComponents';
import type { EmployeeIdentity } from '../types';

interface Props {
  identity: EmployeeIdentity;
  onChange: (identity: EmployeeIdentity) => void;
}

export default function EmployeeIdentityFields({ identity, onChange }: Props) {
  return (
    <div className="space-y-2">
      <InputField
        label="Employee Name"
        value={identity.employeeName}
        onChange={(v) => onChange({ ...identity, employeeName: v })}
        type="text"
        placeholder="Optional"
      />
      <InputField
        label="Date of Birth"
        value={identity.dateOfBirth}
        onChange={(v) => onChange({ ...identity, dateOfBirth: v })}
        type="date"
        placeholder="Optional"
      />
      <InputField
        label="Role / Position"
        value={identity.roleOrPosition}
        onChange={(v) => onChange({ ...identity, roleOrPosition: v })}
        type="text"
        placeholder="Optional"
      />
    </div>
  );
}

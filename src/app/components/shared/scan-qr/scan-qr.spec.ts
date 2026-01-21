import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScanQr } from './scan-qr';

describe('ScanQr', () => {
  let component: ScanQr;
  let fixture: ComponentFixture<ScanQr>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScanQr]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScanQr);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
